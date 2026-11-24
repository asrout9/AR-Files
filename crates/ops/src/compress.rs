use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tracing::info;

use cirrus_core::error::{CirrusError, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CompressionResult {
    pub output_path: String,
    pub original_size: u64,
    pub compressed_size: u64,
}

pub struct CompressManager;

impl CompressManager {
    /// Generates a collision-safe compressed filename in the same folder
    /// format: <stem>_compressed_<size><ext>
    pub fn generate_compressed_filename(source_path: &Path, formatted_size: &str) -> PathBuf {
        let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
        let file_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");

        let (stem, ext) = match file_name.rfind('.') {
            Some(dot) if dot > 0 => (&file_name[..dot], &file_name[dot..]),
            _ => (file_name, ""),
        };

        let clean_size = formatted_size.replace(' ', "");
        let candidate_name = format!("{}_compressed_{}{}", stem, clean_size, ext);
        let candidate_path = parent.join(&candidate_name);

        if !candidate_path.exists() {
            return candidate_path;
        }

        // Auto-number if collision exists
        for i in 1..1000 {
            let numbered_name = format!("{}_compressed_{} ({}){}", stem, clean_size, i, ext);
            let numbered_path = parent.join(&numbered_name);
            if !numbered_path.exists() {
                return numbered_path;
            }
        }

        candidate_path
    }

    /// Compresses an image or PDF file to be at most `target_bytes` in size.
    pub async fn compress_to_size(
        source_path: &Path,
        target_bytes: u64,
        output_path: &Path,
    ) -> Result<CompressionResult> {
        if !source_path.exists() {
            return Err(CirrusError::Validation(format!(
                "Source file '{}' does not exist",
                source_path.display()
            )));
        }

        if target_bytes == 0 {
            return Err(CirrusError::Validation(
                "Target size must be greater than 0 bytes".to_string(),
            ));
        }

        let orig_meta = std::fs::metadata(source_path).map_err(|e| {
            CirrusError::Io(format!("Failed to read source file metadata: {}", e))
        })?;
        let original_size = orig_meta.len();

        let ext = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_pdf = ext == "pdf";
        let is_image = matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif" | "tiff" | "tif" | "avif"
        );

        if !is_pdf && !is_image {
            return Err(CirrusError::Validation(format!(
                "File type '.{}' is not supported for size compression. Only image and PDF files are supported.",
                ext
            )));
        }

        // Ensure target directory exists
        if let Some(parent) = output_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        // If the source file is already smaller than or equal to target_bytes
        if original_size <= target_bytes {
            tokio::fs::copy(source_path, output_path).await.map_err(|e| {
                CirrusError::Io(format!("Failed to copy file to output destination: {}", e))
            })?;
            return Ok(CompressionResult {
                output_path: output_path.to_string_lossy().to_string(),
                original_size,
                compressed_size: original_size,
            });
        }

        let temp_dir = tempfile::tempdir()
            .map_err(|e| CirrusError::Io(format!("Failed to create temporary directory: {}", e)))?;

        let mut success = false;

        if is_pdf {
            success = Self::compress_pdf_to_size(source_path, target_bytes, output_path, temp_dir.path()).await?;
        } else if is_image {
            success = Self::compress_image_to_size(source_path, target_bytes, output_path, temp_dir.path()).await?;
        }

        if !success || !output_path.exists() {
            return Err(CirrusError::Validation(format!(
                "Failed to compress file to within {} bytes",
                target_bytes
            )));
        }

        let compressed_size = std::fs::metadata(output_path)
            .map_err(|e| CirrusError::Io(format!("Failed to verify compressed file size: {}", e)))?
            .len();

        if compressed_size > target_bytes {
            // Remove the oversized file
            let _ = tokio::fs::remove_file(output_path).await;
            return Err(CirrusError::Validation(format!(
                "Resulting size ({} bytes) exceeded target size ({} bytes)",
                compressed_size, target_bytes
            )));
        }

        info!(
            "Successfully compressed '{}' from {} to {} bytes (target: {})",
            source_path.display(),
            original_size,
            compressed_size,
            target_bytes
        );

        Ok(CompressionResult {
            output_path: output_path.to_string_lossy().to_string(),
            original_size,
            compressed_size,
        })
    }

    /// Compress PDF file using Ghostscript with progressive downsampling
    async fn compress_pdf_to_size(
        source_path: &Path,
        target_bytes: u64,
        output_path: &Path,
        temp_dir: &Path,
    ) -> Result<bool> {
        let gs_profiles: [(&str, u32); 7] = [
            ("/printer", 200),
            ("/ebook", 150),
            ("/screen", 120),
            ("/screen", 90),
            ("/screen", 72),
            ("/screen", 50),
            ("/screen", 36),
        ];

        let mut best_candidate: Option<PathBuf> = None;

        for (idx, (pdf_setting, dpi)) in gs_profiles.iter().enumerate() {
            let candidate_path = temp_dir.join(format!("gs_out_{}.pdf", idx));

            let mut cmd = Command::new("gs");
            cmd.arg("-sDEVICE=pdfwrite")
                .arg("-dCompatibilityLevel=1.4")
                .arg(format!("-dPDFSETTINGS={}", pdf_setting))
                .arg("-dNOPAUSE")
                .arg("-dQUIET")
                .arg("-dBATCH")
                .arg("-dDownsampleColorImages=true")
                .arg("-dColorImageDownsampleType=/Bicubic")
                .arg(format!("-dColorImageResolution={}", dpi))
                .arg("-dDownsampleGrayImages=true")
                .arg("-dGrayImageDownsampleType=/Bicubic")
                .arg(format!("-dGrayImageResolution={}", dpi))
                .arg("-dDownsampleMonoImages=true")
                .arg("-dMonoImageDownsampleType=/Bicubic")
                .arg(format!("-dMonoImageResolution={}", dpi))
                .arg(format!("-sOutputFile={}", candidate_path.display()))
                .arg(source_path);

            let res = tokio::time::timeout(Duration::from_secs(30), cmd.output()).await;
            if let Ok(Ok(output)) = res {
                if output.status.success() && candidate_path.exists() {
                    if let Ok(meta) = std::fs::metadata(&candidate_path) {
                        let sz = meta.len();
                        if sz <= target_bytes {
                            best_candidate = Some(candidate_path);
                            break;
                        }
                    }
                }
            }
        }

        // If Ghostscript achieved target size
        if let Some(cand) = best_candidate {
            tokio::fs::copy(&cand, output_path).await.map_err(|e| {
                CirrusError::Io(format!("Failed to copy compressed PDF to destination: {}", e))
            })?;
            return Ok(true);
        }

        // Fallback: try python rasterization if available
        if Self::compress_pdf_via_python_raster(source_path, target_bytes, output_path).await? {
            return Ok(true);
        }

        Ok(false)
    }

    /// Raster fallback for PDF when pure ghostscript vector/text cannot squeeze below target_bytes
    async fn compress_pdf_via_python_raster(
        source_path: &Path,
        target_bytes: u64,
        output_path: &Path,
    ) -> Result<bool> {
        let py_script = r#"
import sys, os, subprocess, tempfile
from PIL import Image

src = sys.argv[1]
dst = sys.argv[2]
target = int(sys.argv[3])

for dpi in [100, 72, 60, 48, 36]:
    for q in [65, 45, 30, 20]:
        with tempfile.TemporaryDirectory() as td:
            prefix = os.path.join(td, 'p')
            try:
                subprocess.run(['pdftoppm', '-r', str(dpi), '-jpeg', '-jpegopt', f'quality={q}', src, prefix],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                pages = sorted([os.path.join(td, f) for f in os.listdir(td) if f.startswith('p-') and f.endswith('.jpg')])
                if not pages:
                    continue
                imgs = [Image.open(p).convert('RGB') for p in pages]
                tmp_out = os.path.join(td, 'out.pdf')
                imgs[0].save(tmp_out, 'PDF', resolution=float(dpi), save_all=True, append_images=imgs[1:])
                sz = os.path.getsize(tmp_out)
                if sz <= target:
                    import shutil
                    shutil.copyfile(tmp_out, dst)
                    sys.exit(0)
            except Exception:
                continue
sys.exit(1)
"#;
        let mut cmd = Command::new("python3");
        cmd.arg("-c")
            .arg(py_script)
            .arg(source_path)
            .arg(output_path)
            .arg(target_bytes.to_string());

        let res = tokio::time::timeout(Duration::from_secs(45), cmd.output()).await;
        if let Ok(Ok(output)) = res {
            if output.status.success() && output_path.exists() {
                if let Ok(meta) = std::fs::metadata(output_path) {
                    if meta.len() <= target_bytes {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }

    /// Compress image file to target_bytes using ImageMagick and Python PIL
    async fn compress_image_to_size(
        source_path: &Path,
        target_bytes: u64,
        output_path: &Path,
        temp_dir: &Path,
    ) -> Result<bool> {
        let ext = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_jpeg = ext == "jpg" || ext == "jpeg";
        let is_webp = ext == "webp";

        // Try ImageMagick native target size
        if is_jpeg || is_webp {
            let candidate_path = temp_dir.join(format!("im_out.{}", ext));
            let mut cmd = Command::new("magick");
            cmd.arg(source_path);

            if is_jpeg {
                cmd.arg("-define").arg(format!("jpeg:extent={}b", target_bytes));
            } else {
                cmd.arg("-define").arg(format!("webp:target-size={}", target_bytes));
            }

            cmd.arg(&candidate_path);

            let res = tokio::time::timeout(Duration::from_secs(15), cmd.output()).await;
            if let Ok(Ok(output)) = res {
                if output.status.success() && candidate_path.exists() {
                    if let Ok(meta) = std::fs::metadata(&candidate_path) {
                        if meta.len() <= target_bytes {
                            tokio::fs::copy(&candidate_path, output_path).await.map_err(|e| {
                                CirrusError::Io(format!("Failed to copy compressed image to destination: {}", e))
                            })?;
                            return Ok(true);
                        }
                    }
                }
            }
        }

        // Comprehensive binary search with Python PIL
        let py_script = r#"
import sys, os, io
from PIL import Image

src = sys.argv[1]
dst = sys.argv[2]
target = int(sys.argv[3])

try:
    im = Image.open(src)
    fmt = im.format or 'JPEG'
    ext = os.path.splitext(src)[1].lower()
    is_png = (fmt.upper() == 'PNG' or ext == '.png')
    
    scale = 1.0
    for attempt in range(12):
        cur_w = max(16, int(im.width * scale))
        cur_h = max(16, int(im.height * scale))
        resized = im.resize((cur_w, cur_h), Image.Resampling.LANCZOS) if scale < 0.999 else im.copy()
        
        if is_png:
            buf = io.BytesIO()
            resized.save(buf, format='PNG', optimize=True)
            if buf.tell() <= target:
                with open(dst, 'wb') as f:
                    f.write(buf.getvalue())
                sys.exit(0)
            
            for colors in [256, 128, 64, 32]:
                try:
                    q_im = resized.quantize(colors=colors)
                    buf = io.BytesIO()
                    q_im.save(buf, format='PNG', optimize=True)
                    if buf.tell() <= target:
                        with open(dst, 'wb') as f:
                            f.write(buf.getvalue())
                        sys.exit(0)
                except Exception:
                    continue
        else:
            # Binary search quality between 5 and 95
            low_q = 5
            high_q = 95
            best_buf = None
            
            work_im = resized
            if fmt.upper() in ('JPEG', 'JPG') and work_im.mode in ('RGBA', 'P', 'LA'):
                work_im = work_im.convert('RGB')
                
            while low_q <= high_q:
                mid_q = (low_q + high_q) // 2
                buf = io.BytesIO()
                work_im.save(buf, format=fmt, quality=mid_q, optimize=True)
                sz = buf.tell()
                if sz <= target:
                    best_buf = buf.getvalue()
                    low_q = mid_q + 1
                else:
                    high_q = mid_q - 1
                    
            if best_buf is not None:
                with open(dst, 'wb') as f:
                    f.write(best_buf)
                sys.exit(0)
                
        scale *= 0.8
except Exception as e:
    sys.exit(2)

sys.exit(1)
"#;
        let mut cmd = Command::new("python3");
        cmd.arg("-c")
            .arg(py_script)
            .arg(source_path)
            .arg(output_path)
            .arg(target_bytes.to_string());

        let res = tokio::time::timeout(Duration::from_secs(30), cmd.output()).await;
        if let Ok(Ok(output)) = res {
            if output.status.success() && output_path.exists() {
                if let Ok(meta) = std::fs::metadata(output_path) {
                    if meta.len() <= target_bytes {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_compressed_filename() {
        let p = Path::new("/home/user/my_doc.pdf");
        let name = CompressManager::generate_compressed_filename(p, "300 KB");
        assert_eq!(name, PathBuf::from("/home/user/my_doc_compressed_300KB.pdf"));

        let p_jpg = Path::new("/photos/sunset.jpg");
        let name_jpg = CompressManager::generate_compressed_filename(p_jpg, "1 MB");
        assert_eq!(name_jpg, PathBuf::from("/photos/sunset_compressed_1MB.jpg"));
    }

    #[tokio::test]
    async fn test_compress_already_smaller_file() {
        let tmp = tempfile::tempdir().unwrap();
        // write fake small pdf
        let src_pdf = tmp.path().join("small.pdf");
        std::fs::write(&src_pdf, b"%PDF-1.4 test").unwrap();
        let out = tmp.path().join("out.pdf");

        let res = CompressManager::compress_to_size(&src_pdf, 100_000, &out).await.unwrap();
        assert_eq!(res.compressed_size, std::fs::metadata(&src_pdf).unwrap().len());
        assert!(out.exists());
    }

    #[tokio::test]
    async fn test_compress_real_image_to_target_size() {
        if !Path::new("/tmp/test_large.jpg").exists() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("test_large_compressed_100KB.jpg");

        let target_bytes = 100 * 1024;
        let res = CompressManager::compress_to_size(
            Path::new("/tmp/test_large.jpg"),
            target_bytes,
            &out,
        )
        .await
        .unwrap();

        assert!(out.exists());
        assert!(res.compressed_size <= target_bytes);
        assert!(std::fs::metadata(&out).unwrap().len() <= target_bytes);
    }
}
