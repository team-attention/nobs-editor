use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent};

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

#[cfg(target_os = "macos")]
fn bring_window_to_front(app: &AppHandle) {
    use cocoa::appkit::{NSWindow, NSApplication, NSApplicationActivationPolicy};
    use cocoa::base::{id, nil};
    use objc::runtime::YES;
    use objc::*;

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(ns_window) = window.ns_window() {
            unsafe {
                let ns_window = ns_window as id;
                let ns_app: id = cocoa::appkit::NSApp();

                // Set collection behavior BEFORE showing:
                // NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0
                // NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8
                let behavior: u64 = (1 << 0) | (1 << 8);
                let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

                // Set window level to appear over fullscreen apps
                let _: () = msg_send![ns_window, setLevel: 101i64];

                // Ensure app is regular
                ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular);

                // Show and bring to front using NSWindow directly
                ns_window.makeKeyAndOrderFront_(nil);

                // Force activate
                let _: () = msg_send![ns_app, activateIgnoringOtherApps: YES];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn bring_window_to_front(_app: &AppHandle) {}

fn process_urls(urls: Vec<url::Url>, state: &tauri::State<OpenedFiles>, app_handle: &AppHandle) {
    let mut files = state.0.lock().unwrap();

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
            files.push(path.clone());
            let _ = app_handle.emit("file-opened", path);
        }
    }

    // Bring window to front after processing
    drop(files); // Release the lock first
    bring_window_to_front(app_handle);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![get_opened_files, clear_opened_files])
        .setup(|app| {
            // Handle window close - hide instead of destroy
            if let Some(window) = app.get_webview_window("main") {
                // Set window properties at startup
                #[cfg(target_os = "macos")]
                {
                    use cocoa::base::id;
                    use objc::*;

                    if let Ok(ns_window) = window.ns_window() {
                        unsafe {
                            let ns_window = ns_window as id;
                            // NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary
                            let behavior: u64 = (1 << 0) | (1 << 8);
                            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                        }
                    }
                }

                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        println!("Rust: Close requested - hiding window");
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

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
            RunEvent::Ready => {
                bring_window_to_front(app_handle);
            }
            // Keep app running even when all windows are closed
            RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        }
    });
}
