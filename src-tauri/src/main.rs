pub mod commands;
pub mod state;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

use cirrus_core::error::Result;
use state::AppState;

async fn handle_ipc_command(
    state: &AppState,
    cmd: &str,
    args: serde_json::Value,
) -> serde_json::Value {
    match cmd {
        "list_accounts" => match commands::list_accounts(state).await {
            Ok(accs) => serde_json::json!({ "success": true, "data": accs }),
            Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
        },
        "list_entries" => {
            let query: cirrus_core::query::FolderListingQuery =
                serde_json::from_value(args.get("query").cloned().unwrap_or(args))
                    .unwrap_or_default();
            match commands::list_entries(state, query).await {
                Ok(res) => serde_json::json!({ "success": true, "data": res }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "start_google_oauth" => {
            let params: commands::GoogleAuthParams =
                serde_json::from_value(args).unwrap_or_default();
            match commands::start_google_oauth(state, params).await {
                Ok(acc) => serde_json::json!({ "success": true, "data": acc }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "add_onedrive_account" => {
            let params: commands::OneDriveAuthParams =
                serde_json::from_value(args).unwrap_or_default();
            match commands::add_onedrive_account(state, params).await {
                Ok(acc) => serde_json::json!({ "success": true, "data": acc }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "add_generic_account" => {
            match serde_json::from_value::<commands::GenericAccountParams>(args) {
                Ok(params) => match commands::add_generic_account(state, params).await {
                    Ok(acc) => serde_json::json!({ "success": true, "data": acc }),
                    Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
                },
                Err(e) => serde_json::json!({
                    "success": false,
                    "error": format!("Invalid parameters: {}", e)
                }),
            }
        }
        "remove_account" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::remove_account(state, account_id).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "update_account_credentials" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let token = args
                .get("token")
                .or_else(|| args.get("access_token"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let refresh_token = args
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let params = commands::UpdateCredentialsParams {
                account_id,
                token,
                refresh_token,
            };
            match commands::update_account_credentials(state, params).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "hydrate_entry" => {
            let entry_id = args
                .get("entry_id")
                .or_else(|| args.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::hydrate_entry(state, entry_id).await {
                Ok(path) => serde_json::json!({ "success": true, "data": path }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "open_file" => {
            let path_or_id = args
                .get("path")
                .or_else(|| args.get("entry_id"))
                .or_else(|| args.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let target = if std::path::Path::new(&path_or_id).exists() {
                path_or_id
            } else if let Ok(Some(entry)) = state.entries_repo.get_entry(&path_or_id) {
                let local_valid = entry
                    .local_path
                    .as_ref()
                    .map(|p| std::path::Path::new(p).exists())
                    .unwrap_or(false);
                if local_valid {
                    entry.local_path.unwrap()
                } else {
                    match commands::hydrate_entry(state, entry.id.clone()).await {
                        Ok(p) => p,
                        Err(e) => return serde_json::json!({ "success": false, "error": e.to_string() }),
                    }
                }
            } else {
                path_or_id
            };

            let _ = tokio::process::Command::new("xdg-open")
                .arg(&target)
                .spawn();
            serde_json::json!({ "success": true, "data": target })
        }
        "trigger_sync" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::trigger_sync(state, account_id).await {
                Ok(count) => serde_json::json!({ "success": true, "data": count }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "get_sync_status" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::get_sync_status(state, account_id).await {
                Ok(st) => serde_json::json!({ "success": true, "data": st }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "get_account_quota" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::get_account_quota(state, account_id).await {
                Ok(q) => serde_json::json!({ "success": true, "data": q }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "pin_entry" => {
            let entry_id = args
                .get("entry_id")
                .or_else(|| args.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::pin_entry(state, entry_id).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "unpin_entry" => {
            let entry_id = args
                .get("entry_id")
                .or_else(|| args.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::unpin_entry(state, entry_id).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "free_up_space" => {
            let entry_id = args
                .get("entry_id")
                .or_else(|| args.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::free_up_space(state, entry_id).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "create_folder" => {
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parent_id = args
                .get("parent_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let name = args
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("New Folder")
                .to_string();
            match commands::create_folder(state, account_id, parent_id, name).await {
                Ok(rec) => serde_json::json!({ "success": true, "data": rec }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "rename_entry" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let new_name = args
                .get("new_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::rename_entry(state, id, new_name).await {
                Ok(rec) => serde_json::json!({ "success": true, "data": rec }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "trash_entries" => {
            let entry_ids: Vec<String> = serde_json::from_value(
                args.get("entry_ids")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
            )
            .unwrap_or_default();
            match commands::trash_entries(state, entry_ids).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "delete_permanently" => {
            let entry_ids: Vec<String> = serde_json::from_value(
                args.get("entry_ids")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
            )
            .unwrap_or_default();
            match commands::delete_permanently(state, entry_ids).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "search_fts" => {
            let term = args
                .get("search_term")
                .or_else(|| args.get("term"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(100) as usize;
            match commands::search_fts(state, term, limit).await {
                Ok(items) => serde_json::json!({ "success": true, "data": items }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "list_local_directory" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("~")
                .to_string();
            match commands::list_local_directory(state, path).await {
                Ok(items) => serde_json::json!({ "success": true, "data": items }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "compress_entries" => {
            let source_paths: Vec<String> = serde_json::from_value(
                args.get("source_paths")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
            )
            .unwrap_or_default();
            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match commands::compress_entries(source_paths, output_path).await {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "compress_to_size" => {
            let source_path = args
                .get("source_path")
                .or_else(|| args.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let target_bytes = args
                .get("target_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let formatted_size = args
                .get("formatted_size")
                .and_then(|v| v.as_str())
                .unwrap_or("compressed")
                .to_string();
            let custom_output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            match commands::compress_to_size(source_path, target_bytes, formatted_size, custom_output_path).await {
                Ok(res) => serde_json::json!({ "success": true, "data": res }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "get_cloud_thumbnail" => {
            match serde_json::from_value::<commands::CloudThumbnailParams>(args) {
                Ok(params) => match commands::get_cloud_thumbnail(state, params).await {
                    Ok(thumb) => serde_json::json!({ "success": true, "data": thumb }),
                    Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
                },
                Err(e) => serde_json::json!({
                    "success": false,
                    "error": format!("Invalid parameters: {}", e)
                }),
            }
        }
        "copy_entries" => {
            let entry_ids: Vec<String> = serde_json::from_value(
                args.get("entry_ids")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
            )
            .unwrap_or_default();
            let target_parent_id = args
                .get("target_parent_id")
                .or_else(|| args.get("target_path"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let collision_str = args
                .get("collision")
                .and_then(|v| v.as_str())
                .unwrap_or("keep_both");
            let collision = match collision_str {
                "replace" => cirrus_ops::CollisionResolution::Replace,
                "skip" => cirrus_ops::CollisionResolution::Skip,
                _ => cirrus_ops::CollisionResolution::KeepBoth,
            };
            match commands::copy_entries(state, entry_ids, target_parent_id, collision).await {
                Ok(items) => serde_json::json!({ "success": true, "data": items }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        "move_entries" => {
            let entry_ids: Vec<String> = serde_json::from_value(
                args.get("entry_ids")
                    .cloned()
                    .unwrap_or(serde_json::Value::Array(Vec::new())),
            )
            .unwrap_or_default();
            let target_parent_id = args
                .get("target_parent_id")
                .or_else(|| args.get("target_path"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            match commands::move_entries(state, entry_ids, target_parent_id).await {
                Ok(items) => serde_json::json!({ "success": true, "data": items }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        _ => {
            serde_json::json!({ "success": false, "error": format!("Unknown command: {}", cmd) })
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize structured logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("Failed to set tracing subscriber");

    info!("Starting AR Files Desktop Manager daemon...");

    let state = Arc::new(AppState::new()?);

    // Register org.freedesktop.FileManager1 D-Bus service
    let (dbus_tx, mut dbus_rx) =
        tokio::sync::mpsc::channel::<cirrus_platform::FileManagerRequest>(32);
    tokio::spawn(async move {
        match cirrus_platform::register_file_manager_service(dbus_tx).await {
            Ok(_conn) => {
                info!("org.freedesktop.FileManager1 D-Bus service registered successfully");
                while let Some(req) = dbus_rx.recv().await {
                    info!("Received D-Bus FileManager1 request: {:?}", req);
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Could not register org.freedesktop.FileManager1 D-Bus service: {}",
                    e
                );
            }
        }
    });

    // Bind Unix Domain Socket for UI IPC commands
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    let socket_dir = home.join(".local").join("share").join("ar-files");
    let _ = std::fs::create_dir_all(&socket_dir);
    let socket_path = socket_dir.join("ipc.sock");

    if socket_path.exists() {
        let _ = std::fs::remove_file(&socket_path);
    }

    let listener = UnixListener::bind(&socket_path)
        .map_err(|e| cirrus_core::error::CirrusError::Io(format!("Failed to bind IPC socket: {}", e)))?;
    info!("AR Files IPC socket listening on {}", socket_path.display());

    let state_ipc = state.clone();
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let state_client = state_ipc.clone();
                    tokio::spawn(async move {
                        let (read_half, mut write_half) = stream.into_split();
                        let mut reader = BufReader::new(read_half);
                        let mut line = String::new();

                        while let Ok(n) = reader.read_line(&mut line).await {
                            if n == 0 {
                                break;
                            }
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                    let cmd = val.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
                                    let args = val.get("args").cloned().unwrap_or(serde_json::Value::Null);

                                    let resp = handle_ipc_command(&state_client, cmd, args).await;
                                    let mut out = serde_json::to_string(&resp).unwrap_or_default();
                                    out.push('\n');
                                    if write_half.write_all(out.as_bytes()).await.is_err() {
                                        break;
                                    }
                                    let _ = write_half.flush().await;
                                }
                            }
                            line.clear();
                        }
                    });
                }
                Err(e) => {
                    error!("Error accepting IPC connection: {}", e);
                }
            }
        }
    });

    info!("AR Files backend initialized cleanly. Ready for UI connections.");

    // Keep backend alive until SIGINT or SIGTERM
    let _ = tokio::signal::ctrl_c().await;
    info!("AR Files backend shutting down cleanly.");

    if socket_path.exists() {
        let _ = std::fs::remove_file(&socket_path);
    }

    Ok(())
}
