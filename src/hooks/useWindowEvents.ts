import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

interface UseWindowEventsOptions {
  currentFilePath: string | null;
  loadFile: (path: string) => Promise<void>;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  showSearch: boolean;
  toggleSearch: () => void;
}

export function useWindowEvents({
  currentFilePath,
  loadFile,
  openFile,
  saveFile,
  showSearch,
  toggleSearch,
}: UseWindowEventsOptions) {
  // Read file path from URL query parameter (passed by Rust backend)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filePath = params.get("file");
    if (filePath) {
      loadFile(decodeURIComponent(filePath));
    }
  }, [loadFile]);

  // Listen for reload-file event from Rust backend (when window is reused)
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupReloadListener = async () => {
      unlistenFn = await listen("reload-file", () => {
        // Re-read file path from URL and reload
        const params = new URLSearchParams(window.location.search);
        const filePath = params.get("file");
        if (filePath) {
          loadFile(decodeURIComponent(filePath));
        }
      });
    };

    setupReloadListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [loadFile]);

  // Hide window instead of closing (keep app running)
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupCloseHandler = async () => {
      const appWindow = getCurrentWindow();
      unlistenFn = await appWindow.onCloseRequested(async (event) => {
        console.log("Close requested - hiding instead");
        event.preventDefault();
        await appWindow.hide();
      });
    };

    setupCloseHandler();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // Reload file when window regains focus (to pick up external changes)
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupFocusHandler = async () => {
      const appWindow = getCurrentWindow();
      unlistenFn = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused && currentFilePath) {
          loadFile(currentFilePath);
        }
      });
    };

    setupFocusHandler();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [currentFilePath, loadFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSearch) {
        e.preventDefault();
        toggleSearch();
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "o") {
          e.preventDefault();
          openFile();
        } else if (e.key === "s") {
          e.preventDefault();
          saveFile();
        } else if (e.key === "f") {
          e.preventDefault();
          toggleSearch();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFile, saveFile, showSearch, toggleSearch]);
}
