use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

// Store opened file paths for later retrieval
struct OpenedFiles(Mutex<Vec<String>>);

#[tauri::command]
fn get_opened_files(state: tauri::State<OpenedFiles>) -> Vec<String> {
    let files = state.0.lock().unwrap();
    files.clone()
}

#[tauri::command]
fn clear_opened_files(state: tauri::State<OpenedFiles>) {
    let mut files = state.0.lock().unwrap();
    files.clear();
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
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

            // CanJoinAllSpaces (1<<0) | FullScreenAuxiliary (1<<8)
            let behavior: u64 = (1 << 0) | (1 << 8);
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Window level above fullscreen apps
            let _: () = msg_send![ns_window, setLevel: 101i64];

            // Temporarily become a regular app so macOS brings us forward
            ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);

            ns_window.makeKeyAndOrderFront_(nil);
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: YES];
        }
    }
}

/// Creates or shows window
fn open_window(app: &AppHandle) {
    // Check if window exists (warm start - app was already running)
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        #[cfg(target_os = "macos")]
        bring_window_to_front(&window);
        let _ = window.set_focus();
        return;
    }

    // Cold start - create new window
    if let Ok(window) = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("JustViewer")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .visible(false)
        .build()
    {
        #[cfg(target_os = "macos")]
        bring_window_to_front(&window);

        let _ = window.show();
        let _ = window.set_focus();

        // Setup close handler - hide instead of close
        let w = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
            }
        });
    }
}


fn process_urls(urls: Vec<url::Url>, state: &tauri::State<OpenedFiles>, app_handle: &AppHandle) {
    // Collect paths first
    let mut paths: Vec<String> = Vec::new();

    for url in urls {
        let path = if url.scheme() == "file" {
            url.to_file_path().ok().map(|p| p.to_string_lossy().to_string())
        } else if url.scheme() == "justviewer" {
            url.query_pairs()
                .find(|(key, _)| key == "path")
                .map(|(_, value)| value.to_string())
        } else {
            None
        };

        if let Some(path) = path {
            paths.push(path);
        }
    }

    if paths.is_empty() {
        return;
    }

    // Store in state
    {
        let mut files = state.0.lock().unwrap();
        for path in &paths {
            files.push(path.clone());
        }
    }

    // Open window (creates new on cold start, shows existing on warm start)
    open_window(app_handle);

    // Emit file-opened events after window is ready
    let app_clone = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        for path in paths {
            let _ = app_clone.emit("file-opened", path);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![get_opened_files, clear_opened_files, read_file, write_file])
        .setup(|app| {
            // LSUIElement in Info.plist makes this a background app (no dock icon, no space switching)
            // Windows are created on demand

            // Check for URLs passed at startup (cold start)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(urls) = app.deep_link().get_current() {
                    if let Some(urls) = urls {
                        let state = app.state::<OpenedFiles>();
                        let mut files = state.0.lock().unwrap();
                        for url in urls {
                            let path = if url.scheme() == "file" {
                                url.to_file_path().ok().map(|p| p.to_string_lossy().to_string())
                            } else {
                                None
                            };
                            if let Some(path) = path {
                                files.push(path);
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
                let state = app_handle.state::<OpenedFiles>();
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
