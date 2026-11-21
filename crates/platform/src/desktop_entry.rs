use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

use cirrus_core::error::{CirrusError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopEntry {
    pub id: String,
    pub name: String,
    pub exec: String,
    pub icon: Option<String>,
    pub mime_types: Vec<String>,
    pub terminal: bool,
    pub no_display: bool,
}

pub struct DesktopEntryManager {
    applications: HashMap<String, DesktopEntry>,
    mime_defaults: HashMap<String, String>,
}

impl DesktopEntryManager {
    pub fn new() -> Self {
        let mut mgr = Self {
            applications: HashMap::new(),
            mime_defaults: HashMap::new(),
        };
        mgr.load_mimeapps_list();
        mgr.load_desktop_files();
        mgr
    }

    fn load_mimeapps_list(&mut self) {
        let mut paths = Vec::new();

        if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            paths.push(PathBuf::from(config_home).join("mimeapps.list"));
        } else if let Some(home) = std::env::var_os("HOME") {
            paths.push(PathBuf::from(home).join(".config").join("mimeapps.list"));
        }

        paths.push(PathBuf::from("/etc/xdg/mimeapps.list"));
        paths.push(PathBuf::from("/usr/share/applications/mimeapps.list"));

        for p in paths {
            if !p.exists() {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&p) {
                let mut in_default_section = false;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed == "[Default Applications]" {
                        in_default_section = true;
                        continue;
                    } else if trimmed.starts_with('[') {
                        in_default_section = false;
                        continue;
                    }

                    if in_default_section && trimmed.contains('=') {
                        let mut parts = trimmed.splitn(2, '=');
                        if let (Some(mime), Some(apps)) = (parts.next(), parts.next()) {
                            let mime = mime.trim().to_string();
                            let primary_app =
                                apps.split(';').next().unwrap_or("").trim().to_string();
                            if !primary_app.is_empty() {
                                self.mime_defaults.entry(mime).or_insert(primary_app);
                            }
                        }
                    }
                }
            }
        }
    }

    fn load_desktop_files(&mut self) {
        let mut search_dirs = Vec::new();

        if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            search_dirs.push(PathBuf::from(data_home).join("applications"));
        } else if let Some(home) = std::env::var_os("HOME") {
            search_dirs.push(
                PathBuf::from(home)
                    .join(".local")
                    .join("share")
                    .join("applications"),
            );
        }

        search_dirs.push(PathBuf::from("/usr/local/share/applications"));
        search_dirs.push(PathBuf::from("/usr/share/applications"));

        for dir in search_dirs {
            if !dir.exists() {
                continue;
            }

            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("desktop") {
                        if let Ok(parsed) = Self::parse_desktop_file(&path) {
                            self.applications.entry(parsed.id.clone()).or_insert(parsed);
                        }
                    }
                }
            }
        }
    }

    pub fn parse_desktop_file(path: &Path) -> Result<DesktopEntry> {
        let id = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();

        let content = fs::read_to_string(path)
            .map_err(|e| CirrusError::Io(format!("Failed to read .desktop file: {}", e)))?;

        let mut name = None;
        let mut exec = None;
        let mut icon = None;
        let mut mime_types = Vec::new();
        let mut terminal = false;
        let mut no_display = false;

        let mut in_desktop_entry = false;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == "[Desktop Entry]" {
                in_desktop_entry = true;
                continue;
            } else if trimmed.starts_with('[') {
                in_desktop_entry = false;
                continue;
            }

            if in_desktop_entry && trimmed.contains('=') {
                let mut parts = trimmed.splitn(2, '=');
                if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
                    let key = key.trim();
                    let val = val.trim();

                    match key {
                        "Name" if name.is_none() => name = Some(val.to_string()),
                        "Exec" => exec = Some(val.to_string()),
                        "Icon" => icon = Some(val.to_string()),
                        "Terminal" => terminal = val.eq_ignore_ascii_case("true"),
                        "NoDisplay" => no_display = val.eq_ignore_ascii_case("true"),
                        "MimeType" => {
                            mime_types = val
                                .split(';')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                        }
                        _ => {}
                    }
                }
            }
        }

        let name = name.unwrap_or_else(|| id.clone());
        let exec = exec.ok_or_else(|| CirrusError::Validation("Missing Exec field".to_string()))?;

        Ok(DesktopEntry {
            id,
            name,
            exec,
            icon,
            mime_types,
            terminal,
            no_display,
        })
    }

    pub fn get_default_app(&self, mime_type: &str) -> Option<&DesktopEntry> {
        if let Some(app_id) = self.mime_defaults.get(mime_type) {
            if let Some(app) = self.applications.get(app_id) {
                return Some(app);
            }
        }

        // Fallback: search applications supporting this mime type
        self.applications
            .values()
            .find(|app| !app.no_display && app.mime_types.iter().any(|m| m == mime_type))
    }

    pub fn get_apps_for_mime(&self, mime_type: &str) -> Vec<&DesktopEntry> {
        self.applications
            .values()
            .filter(|app| !app.no_display && app.mime_types.iter().any(|m| m == mime_type))
            .collect()
    }

    /// Formats the command line tokens according to Freedesktop Exec field codes.
    pub fn format_exec_tokens(exec: &str, file_paths: &[&Path]) -> Vec<String> {
        let mut tokens = Vec::new();
        let parts: Vec<&str> = exec.split_whitespace().collect();

        for part in parts {
            match part {
                "%f" => {
                    if let Some(first) = file_paths.first() {
                        tokens.push(first.to_string_lossy().to_string());
                    }
                }
                "%F" => {
                    for path in file_paths {
                        tokens.push(path.to_string_lossy().to_string());
                    }
                }
                "%u" => {
                    if let Some(first) = file_paths.first() {
                        let path_str = first.to_string_lossy();
                        tokens.push(format!("file://{}", path_str));
                    }
                }
                "%U" => {
                    for path in file_paths {
                        let path_str = path.to_string_lossy();
                        tokens.push(format!("file://{}", path_str));
                    }
                }
                "%i" | "%c" | "%k" | "%m" => {
                    // Deprecated or ignored spec codes
                }
                other => {
                    tokens.push(other.to_string());
                }
            }
        }

        tokens
    }

    /// Spawns an application asynchronously with the selected file paths.
    pub async fn launch_app(&self, app: &DesktopEntry, file_paths: &[&Path]) -> Result<()> {
        let tokens = Self::format_exec_tokens(&app.exec, file_paths);
        if tokens.is_empty() {
            return Err(CirrusError::Validation(
                "Empty command after formatting".to_string(),
            ));
        }

        let program = &tokens[0];
        let args = &tokens[1..];

        info!(
            "Launching app '{}' with command: {} {:?}",
            app.name, program, args
        );

        tokio::process::Command::new(program)
            .args(args)
            .spawn()
            .map_err(|e| CirrusError::Io(format!("Failed to spawn app '{}': {}", program, e)))?;

        Ok(())
    }

    /// Checks if AR Files (or cirrus-files) is set as the default file manager for inode/directory.
    pub fn is_default_file_manager(&self) -> bool {
        if let Some(app_id) = self.mime_defaults.get("inode/directory") {
            if app_id == "ar-files.desktop"
                || app_id == "cirrus-files.desktop"
                || app_id == "com.cirrus.files.desktop"
            {
                return true;
            }
        }

        if let Ok(output) = std::process::Command::new("xdg-mime")
            .args(["query", "default", "inode/directory"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "ar-files.desktop"
                    || stdout == "cirrus-files.desktop"
                    || stdout == "com.cirrus.files.desktop"
                {
                    return true;
                }
            }
        }

        false
    }

    /// Registers AR Files as the default file manager.
    /// Creates the .desktop file in ~/.local/share/applications/ar-files.desktop if needed,
    /// and updates ~/.config/mimeapps.list using xdg-mime and directly in mimeapps.list.
    pub fn register_as_default_file_manager(&mut self) -> Result<()> {
        let app_dir = if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
            PathBuf::from(data_home).join("applications")
        } else if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("applications")
        } else {
            PathBuf::from("/tmp/applications")
        };
        fs::create_dir_all(&app_dir)
            .map_err(|e| CirrusError::Io(format!("Failed to create apps directory: {}", e)))?;

        let desktop_file_path = app_dir.join("ar-files.desktop");
        let desktop_content = r#"[Desktop Entry]
Name=AR Files
Comment=Access and organize files and cloud storage
Exec=ar-files %U
Icon=org.gnome.Nautilus
Terminal=false
Type=Application
Categories=GNOME;GTK;Utility;Core;FileManager;
MimeType=inode/directory;
Actions=new-window;

[Desktop Action new-window]
Name=New Window
Exec=ar-files --new-window
"#;
        fs::write(&desktop_file_path, desktop_content)
            .map_err(|e| CirrusError::Io(format!("Failed to write desktop file: {}", e)))?;

        let _ = std::process::Command::new("xdg-mime")
            .args(["default", "ar-files.desktop", "inode/directory"])
            .status();

        let config_dir = if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            PathBuf::from(config_home)
        } else if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home).join(".config")
        } else {
            PathBuf::from("/tmp")
        };
        fs::create_dir_all(&config_dir).ok();
        let mimeapps_path = config_dir.join("mimeapps.list");
        Self::update_mimeapps_list(&mimeapps_path, "inode/directory", "ar-files.desktop")?;

        self.mime_defaults.insert(
            "inode/directory".to_string(),
            "ar-files.desktop".to_string(),
        );
        if let Ok(parsed) = Self::parse_desktop_file(&desktop_file_path) {
            self.applications.insert(parsed.id.clone(), parsed);
        }

        info!("Successfully registered AR Files as default file manager for inode/directory");
        Ok(())
    }

    pub fn update_mimeapps_list(path: &Path, mime_type: &str, app_id: &str) -> Result<()> {
        let existing = fs::read_to_string(path).unwrap_or_default();
        let mut lines: Vec<String> = existing.lines().map(|s| s.to_string()).collect();
        let mut in_default_section = false;
        let mut default_section_idx = None;
        let mut found_mime = false;

        for (idx, line) in lines.iter_mut().enumerate() {
            let trimmed = line.trim();
            if trimmed == "[Default Applications]" {
                in_default_section = true;
                default_section_idx = Some(idx);
                continue;
            } else if trimmed.starts_with('[') && in_default_section {
                in_default_section = false;
            }

            if in_default_section && trimmed.starts_with(&format!("{}=", mime_type)) {
                *line = format!("{}={};", mime_type, app_id);
                found_mime = true;
                break;
            }
        }

        if !found_mime {
            if let Some(idx) = default_section_idx {
                lines.insert(idx + 1, format!("{}={};", mime_type, app_id));
            } else {
                lines.push("[Default Applications]".to_string());
                lines.push(format!("{}={};", mime_type, app_id));
            }
        }

        fs::write(path, lines.join("\n") + "\n")
            .map_err(|e| CirrusError::Io(format!("Failed to update mimeapps.list: {}", e)))?;

        Ok(())
    }
}

impl Default for DesktopEntryManager {
    fn default() -> Self {
        Self::new()
    }
}
