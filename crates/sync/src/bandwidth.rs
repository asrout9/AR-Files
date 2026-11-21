use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::time::sleep;

#[derive(Clone)]
pub struct BandwidthLimiter {
    limit_bps: Arc<AtomicU64>,
    window_start: Arc<parking_lot::Mutex<Instant>>,
    bytes_in_window: Arc<AtomicU64>,
}

impl Default for BandwidthLimiter {
    fn default() -> Self {
        Self::new(0) // 0 = unlimited by default
    }
}

impl BandwidthLimiter {
    pub fn new(limit_bps: u64) -> Self {
        Self {
            limit_bps: Arc::new(AtomicU64::new(limit_bps)),
            window_start: Arc::new(parking_lot::Mutex::new(Instant::now())),
            bytes_in_window: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn set_limit(&self, limit_bps: u64) {
        self.limit_bps.store(limit_bps, Ordering::SeqCst);
    }

    pub fn get_limit(&self) -> u64 {
        self.limit_bps.load(Ordering::SeqCst)
    }

    /// Throttles async execution if the throughput in the current 1-second window exceeds limit_bps.
    pub async fn throttle(&self, bytes: u64) {
        let limit = self.limit_bps.load(Ordering::SeqCst);
        if limit == 0 {
            return;
        }

        let sleep_duration = {
            let mut start = self.window_start.lock();
            let elapsed = start.elapsed();
            if elapsed.as_secs() >= 1 {
                *start = Instant::now();
                self.bytes_in_window.store(bytes, Ordering::SeqCst);
                None
            } else {
                let accumulated = self.bytes_in_window.fetch_add(bytes, Ordering::SeqCst) + bytes;
                if accumulated > limit {
                    Some(std::time::Duration::from_millis(1000).saturating_sub(elapsed))
                } else {
                    None
                }
            }
        };

        if let Some(dur) = sleep_duration {
            sleep(dur).await;
            let mut start_again = self.window_start.lock();
            *start_again = Instant::now();
            self.bytes_in_window.store(0, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bandwidth_limiter_setting_and_unlimited() {
        let limiter = BandwidthLimiter::default();
        assert_eq!(limiter.get_limit(), 0);

        limiter.set_limit(10_000_000); // 10 MB/s
        assert_eq!(limiter.get_limit(), 10_000_000);

        // Throttle call with small payload completes immediately
        let t0 = Instant::now();
        limiter.throttle(1024).await;
        assert!(t0.elapsed().as_millis() < 50);
    }
}
