use std::path::{Path, PathBuf};
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThumbnailSize {
    Normal, // 128x128
    Large,  // 256x256
    XLarge, // 512x512
}

impl ThumbnailSize {
    pub fn dir_name(&self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Large => "large",
            Self::XLarge => "x-large",
        }
    }
}

pub struct ThumbnailManager {
    cache_base: PathBuf,
}

impl ThumbnailManager {
    pub fn new() -> Self {
        let xdg_cache = std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let home = std::env::var_os("HOME").unwrap_or_default();
                PathBuf::from(home).join(".cache")
            });

        Self {
            cache_base: xdg_cache.join("thumbnails"),
        }
    }

    /// Computes the Freedesktop thumbnail cache filename for a given file URI.
    pub fn compute_thumbnail_filename(file_path: &Path) -> Option<String> {
        let url = Url::from_file_path(file_path).ok()?;
        let uri_str = url.as_str();

        // MD5 hash of canonical URI string as required by the Freedesktop Thumbnail Spec
        let digest = format!("{:x}", md5::compute(uri_str.as_bytes()));
        Some(format!("{}.png", digest))
    }

    /// Checks if a thumbnail exists in the Freedesktop thumbnail cache.
    pub fn get_cached_thumbnail(&self, file_path: &Path, size: ThumbnailSize) -> Option<PathBuf> {
        let filename = Self::compute_thumbnail_filename(file_path)?;
        let thumb_path = self.cache_base.join(size.dir_name()).join(filename);

        if thumb_path.exists() {
            Some(thumb_path)
        } else {
            None
        }
    }
}

impl Default for ThumbnailManager {
    fn default() -> Self {
        Self::new()
    }
}

// Minimal inlined MD5 implementation for Freedesktop spec compliance
#[allow(clippy::chunks_exact_to_as_chunks)]
mod md5 {
    pub fn compute(data: &[u8]) -> md5_compat::Digest {
        md5_compat::compute(data)
    }

    mod md5_compat {
        use std::fmt;

        pub struct Digest([u8; 16]);

        pub fn compute(input: &[u8]) -> Digest {
            // Standard MD5 block algorithm for XDG thumbnail hashing
            let mut h = [0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32];

            let len = input.len();
            let mut padded = input.to_vec();
            padded.push(0x80);
            while (padded.len() % 64) != 56 {
                padded.push(0);
            }
            let bit_len = (len as u64) * 8;
            padded.extend_from_slice(&bit_len.to_le_bytes());

            for chunk in padded.chunks_exact(64) {
                let mut words = [0u32; 16];
                for (i, word) in words.iter_mut().enumerate() {
                    let start = i * 4;
                    *word = u32::from_le_bytes([
                        chunk[start],
                        chunk[start + 1],
                        chunk[start + 2],
                        chunk[start + 3],
                    ]);
                }

                let (mut a, mut b, mut c, mut d) = (h[0], h[1], h[2], h[3]);

                macro_rules! step {
                    ($f:expr, $a:expr, $b:expr, $c:expr, $d:expr, $k:expr, $s:expr, $i:expr) => {
                        $a = $b.wrapping_add(
                            ($a.wrapping_add($f).wrapping_add(words[$k]).wrapping_add($i))
                                .rotate_left($s),
                        );
                    };
                }

                // Round 1
                step!((b & c) | (!b & d), a, b, c, d, 0, 7, 0xd76aa478);
                step!((a & b) | (!a & c), d, a, b, c, 1, 12, 0xe8c7b756);
                step!((d & a) | (!d & b), c, d, a, b, 2, 17, 0x242070db);
                step!((c & d) | (!c & a), b, c, d, a, 3, 22, 0xc1bdceee);
                step!((b & c) | (!b & d), a, b, c, d, 4, 7, 0xf57c0faf);
                step!((a & b) | (!a & c), d, a, b, c, 5, 12, 0x4787c62a);
                step!((d & a) | (!d & b), c, d, a, b, 6, 17, 0xa8304613);
                step!((c & d) | (!c & a), b, c, d, a, 7, 22, 0xfd469501);
                step!((b & c) | (!b & d), a, b, c, d, 8, 7, 0x698098d8);
                step!((a & b) | (!a & c), d, a, b, c, 9, 12, 0x8b44f7af);
                step!((d & a) | (!d & b), c, d, a, b, 10, 17, 0xffff5bb1);
                step!((c & d) | (!c & a), b, c, d, a, 11, 22, 0x895cd7be);
                step!((b & c) | (!b & d), a, b, c, d, 12, 7, 0x6b901122);
                step!((a & b) | (!a & c), d, a, b, c, 13, 12, 0xfd987193);
                step!((d & a) | (!d & b), c, d, a, b, 14, 17, 0xa679438e);
                step!((c & d) | (!c & a), b, c, d, a, 15, 22, 0x49b40821);

                // Round 2
                step!((b & d) | (c & !d), a, b, c, d, 1, 5, 0xf61e2562);
                step!((a & c) | (b & !c), d, a, b, c, 6, 9, 0xc040b340);
                step!((d & b) | (a & !b), c, d, a, b, 11, 14, 0x265e5a51);
                step!((c & a) | (d & !a), b, c, d, a, 0, 20, 0xe9b6c7aa);
                step!((b & d) | (c & !d), a, b, c, d, 5, 5, 0xd62f105d);
                step!((a & c) | (b & !c), d, a, b, c, 10, 9, 0x02441453);
                step!((d & b) | (a & !b), c, d, a, b, 15, 14, 0xd8a1e681);
                step!((c & a) | (d & !a), b, c, d, a, 4, 20, 0xe7d3fbc8);
                step!((b & d) | (c & !d), a, b, c, d, 9, 5, 0x21e1cde6);
                step!((a & c) | (b & !c), d, a, b, c, 14, 9, 0xc33707d6);
                step!((d & b) | (a & !b), c, d, a, b, 3, 14, 0xf4d50d87);
                step!((c & a) | (d & !a), b, c, d, a, 8, 20, 0x455a14ed);
                step!((b & d) | (c & !d), a, b, c, d, 13, 5, 0xa9e3e905);
                step!((a & c) | (b & !c), d, a, b, c, 2, 9, 0xfcefa3f8);
                step!((d & b) | (a & !b), c, d, a, b, 7, 14, 0x676f02d9);
                step!((c & a) | (d & !a), b, c, d, a, 12, 20, 0x8d2a4c8a);

                // Round 3
                step!(b ^ c ^ d, a, b, c, d, 5, 4, 0xfffa3942);
                step!(a ^ b ^ c, d, a, b, c, 8, 11, 0x8771f681);
                step!(d ^ a ^ b, c, d, a, b, 11, 16, 0x6d9d6122);
                step!(c ^ d ^ a, b, c, d, a, 14, 23, 0xfde5380c);
                step!(b ^ c ^ d, a, b, c, d, 1, 4, 0xa4beea44);
                step!(a ^ b ^ c, d, a, b, c, 4, 11, 0x4bdecfa9);
                step!(d ^ a ^ b, c, d, a, b, 7, 16, 0xf6bb4b60);
                step!(c ^ d ^ a, b, c, d, a, 10, 23, 0xbebfbc70);
                step!(b ^ c ^ d, a, b, c, d, 13, 4, 0x289b7ec6);
                step!(a ^ b ^ c, d, a, b, c, 0, 11, 0xeaa127fa);
                step!(d ^ a ^ b, c, d, a, b, 3, 16, 0xd4ef3085);
                step!(c ^ d ^ a, b, c, d, a, 6, 23, 0x04881d05);
                step!(b ^ c ^ d, a, b, c, d, 9, 4, 0xd9d4d039);
                step!(a ^ b ^ c, d, a, b, c, 12, 11, 0xe6db99e5);
                step!(d ^ a ^ b, c, d, a, b, 15, 16, 0x1fa27cf8);
                step!(c ^ d ^ a, b, c, d, a, 2, 23, 0xc4ac5665);

                // Round 4
                step!(c ^ (b | !d), a, b, c, d, 0, 6, 0xf4292244);
                step!(b ^ (a | !c), d, a, b, c, 7, 10, 0x432aff97);
                step!(a ^ (d | !b), c, d, a, b, 14, 15, 0xab9423a7);
                step!(d ^ (c | !a), b, c, d, a, 5, 21, 0xfc93a039);
                step!(c ^ (b | !d), a, b, c, d, 12, 6, 0x655b59c3);
                step!(b ^ (a | !c), d, a, b, c, 3, 10, 0x8f0ccc92);
                step!(a ^ (d | !b), c, d, a, b, 10, 15, 0xffeff47d);
                step!(d ^ (c | !a), b, c, d, a, 1, 21, 0x85845dd1);
                step!(c ^ (b | !d), a, b, c, d, 8, 6, 0x6fa87e4f);
                step!(b ^ (a | !c), d, a, b, c, 15, 10, 0xfe2ce6e0);
                step!(a ^ (d | !b), c, d, a, b, 6, 15, 0xa3014314);
                step!(d ^ (c | !a), b, c, d, a, 13, 21, 0x4e0811a1);
                step!(c ^ (b | !d), a, b, c, d, 4, 6, 0xf7537e82);
                step!(b ^ (a | !c), d, a, b, c, 11, 10, 0xbd3af235);
                step!(a ^ (d | !b), c, d, a, b, 2, 15, 0x2ad7d2bb);
                step!(d ^ (c | !a), b, c, d, a, 9, 21, 0xeb86d391);

                h[0] = h[0].wrapping_add(a);
                h[1] = h[1].wrapping_add(b);
                h[2] = h[2].wrapping_add(c);
                h[3] = h[3].wrapping_add(d);
            }

            let mut out = [0u8; 16];
            for (i, word) in h.iter().enumerate() {
                out[i * 4..i * 4 + 4].copy_from_slice(&word.to_le_bytes());
            }
            Digest(out)
        }

        impl fmt::LowerHex for Digest {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                for byte in &self.0 {
                    write!(f, "{:02x}", byte)?;
                }
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thumbnail_hashing() {
        let path = Path::new("/home/user/Pictures/test.png");
        let hash = ThumbnailManager::compute_thumbnail_filename(path);
        assert!(hash.is_some());
        let name = hash.unwrap();
        assert!(name.ends_with(".png"));
        assert_eq!(name.len(), 32 + 4); // 32 hex chars + .png
    }
}
