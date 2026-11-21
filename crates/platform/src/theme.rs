use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColorScheme {
    PreferLight,
    PreferDark,
    Default,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GnomeAppearance {
    pub color_scheme: ColorScheme,
    pub accent_color: String,
    pub font_name: String,
}

impl Default for GnomeAppearance {
    fn default() -> Self {
        Self {
            color_scheme: ColorScheme::PreferDark,
            accent_color: "blue".to_string(),
            font_name: "Cantarell 11".to_string(),
        }
    }
}

pub struct ThemeManager;

impl ThemeManager {
    /// Resolves standard Freedesktop / Adwaita symbolic icon names based on MIME type and directory flag.
    pub fn resolve_symbolic_icon(mime_type: &str, is_directory: bool) -> &'static str {
        if is_directory {
            return "folder-symbolic";
        }

        match mime_type {
            // Text & Documents
            "text/plain" => "text-x-generic-symbolic",
            "text/markdown" => "text-x-generic-symbolic",
            "text/html" => "text-html-symbolic",
            "text/x-rust" | "text/x-c" | "text/x-python" | "application/javascript" => {
                "text-x-script-symbolic"
            }
            "application/pdf" => "x-office-document-symbolic",

            // Office Documents
            m if m.contains("wordprocessingml") || m.contains("msword") => {
                "x-office-document-symbolic"
            }
            m if m.contains("spreadsheetml") || m.contains("ms-excel") => {
                "x-office-spreadsheet-symbolic"
            }
            m if m.contains("presentationml") || m.contains("ms-powerpoint") => {
                "x-office-presentation-symbolic"
            }

            // Media
            m if m.starts_with("image/") => "image-x-generic-symbolic",
            m if m.starts_with("video/") => "video-x-generic-symbolic",
            m if m.starts_with("audio/") => "audio-x-generic-symbolic",

            // Archives
            "application/zip"
            | "application/x-tar"
            | "application/x-7z-compressed"
            | "application/gzip" => "package-x-generic-symbolic",

            // Executables
            "application/x-executable" | "application/x-sharedlib" => {
                "application-x-executable-symbolic"
            }

            // Fallback
            _ => "text-x-generic-symbolic",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_icon_resolution() {
        assert_eq!(
            ThemeManager::resolve_symbolic_icon("inode/directory", true),
            "folder-symbolic"
        );
        assert_eq!(
            ThemeManager::resolve_symbolic_icon("image/png", false),
            "image-x-generic-symbolic"
        );
        assert_eq!(
            ThemeManager::resolve_symbolic_icon("application/pdf", false),
            "x-office-document-symbolic"
        );
    }
}
