use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

// Track which file is open in which window (file_path -> window_label)
struct OpenWindows(Mutex<HashMap<String, String>>);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn open_file(path: String, app: AppHandle, state: tauri::State<OpenWindows>) {
    open_window_for_file(&app, &path, &state);
}

/// Bring window to front on the current space (works with LSUIElement apps)
#[cfg(target_os = "macos")]
fn bring_window_to_front(window: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSApplication, NSApplicationActivationPolicy, NSWindow};
    use cocoa::base::{id, nil};
    use objc::runtime::YES;
    use objc::*;

    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            let ns_window = ns_window as id;
            let ns_app: id = cocoa::appkit::NSApp();

            // FullScreenAuxiliary (1<<8) allows the window to appear on fullscreen spaces
            // Note: removed CanJoinAllSpaces (1<<0) so windows stay on their original space
            let behavior: u64 = 1 << 8;
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Normal window level - respects standard z-ordering
            let _: () = msg_send![ns_window, setLevel: 0i64];

            // Temporarily become a regular app so macOS brings us forward
            ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);

            ns_window.makeKeyAndOrderFront_(nil);
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: YES];

            // Return to accessory/background app after activation
            ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory);
        }
    }
}

/// Opens a window for the given file path.
/// If the file is already open in a window, shows and focuses that window.
/// Otherwise, creates a new window for the file.
fn open_window_for_file(app: &AppHandle, path: &str, state: &tauri::State<OpenWindows>) {
    let mut windows = state.0.lock().unwrap();

    // Check if file is already open in a window
    if let Some(label) = windows.get(path) {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.show();
            #[cfg(target_os = "macos")]
            bring_window_to_front(&window);
            let _ = window.set_focus();
            // Emit reload event so frontend reloads file content
            let _ = window.emit("reload-file", ());
            return;
        } else {
            // Window was destroyed, remove stale entry
            windows.remove(path);
        }
    }

    // Generate unique window label using timestamp
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let label = format!("window_{}", timestamp);

    // Create URL with file path as query parameter
    let encoded_path = urlencoding::encode(path);
    let url = WebviewUrl::App(format!("?file={}", encoded_path).into());

    // Create new window
    if let Ok(window) = WebviewWindowBuilder::new(app, &label, url)
        .title("Nobs Editor")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .visible(false)
        .build()
    {
        // Store mapping before releasing lock
        windows.insert(path.to_string(), label.clone());
        drop(windows); // Release lock before setting up event handler

        #[cfg(target_os = "macos")]
        bring_window_to_front(&window);

        let _ = window.show();
        let _ = window.set_focus();

        // Setup close handler - hide instead of close, and clean up state on destroy
        let w = window.clone();
        let file_path = path.to_string();
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = w.hide();
                }
                tauri::WindowEvent::Destroyed => {
                    // Clean up state when window is destroyed
                    let state = app_handle.state::<OpenWindows>();
                    let mut windows = state.0.lock().unwrap();
                    windows.remove(&file_path);
                }
                _ => {}
            }
        });
    }
}

fn process_urls(urls: Vec<url::Url>, state: &tauri::State<OpenWindows>, app_handle: &AppHandle) {
    for url in urls {
        let path = if url.scheme() == "file" {
            url.to_file_path().ok().map(|p| p.to_string_lossy().to_string())
        } else if url.scheme() == "nobseditor" {
            url.query_pairs()
                .find(|(key, _)| key == "path")
                .map(|(_, value)| value.to_string())
        } else {
            None
        };

        if let Some(path) = path {
            open_window_for_file(app_handle, &path, state);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenWindows(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![read_file, write_file, open_file])
        .setup(|app| {
            // LSUIElement in Info.plist makes this a background app (no dock icon, no space switching)
            // Windows are created on demand

            // Create tray icon with quit menu
            let quit_item = MenuItem::with_id(app, "quit", "Quit Nobs Editor", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().ok_or("Default window icon not found")?.clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            // Check for URLs passed at startup (cold start)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(urls) = app.deep_link().get_current() {
                    if let Some(urls) = urls {
                        let state = app.state::<OpenWindows>();
                        for url in urls {
                            let path = if url.scheme() == "file" {
                                url.to_file_path().ok().map(|p| p.to_string_lossy().to_string())
                            } else {
                                None
                            };
                            if let Some(path) = path {
                                open_window_for_file(app.handle(), &path, &state);
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::Opened { urls } => {
                let state = app_handle.state::<OpenWindows>();
                process_urls(urls, &state, app_handle);
            }
            // Don't create window on Ready - only when file is opened
            RunEvent::Ready => {}
            // Keep app running even when all windows are closed
            RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        }
    });
}
