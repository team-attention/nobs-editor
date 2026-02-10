import { useEffect, useRef } from "react";
import { watch } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface UseFileWatcherOptions {
  currentFilePath: string | null;
  isDirty: boolean;
  loadFile: (path: string) => Promise<void>;
}

export function useFileWatcher({ currentFilePath, isDirty, loadFile }: UseFileWatcherOptions) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const lastMtimeRef = useRef<number>(0);

  // File watcher: watch current file for external changes
  useEffect(() => {
    if (!currentFilePath) return;

    let unwatchFn: (() => void) | null = null;

    const setupWatcher = async () => {
      // Store initial mtime
      try {
        const mtime = await invoke<number>("stat_file", { path: currentFilePath });
        lastMtimeRef.current = mtime;
      } catch {
        // Ignore stat errors
      }

      unwatchFn = await watch(currentFilePath, async () => {
        if (!isDirtyRef.current) {
          try {
            const mtime = await invoke<number>("stat_file", { path: currentFilePath });
            lastMtimeRef.current = mtime;
          } catch {
            // Ignore stat errors
          }
          loadFile(currentFilePath);
        }
      }, { delayMs: 500 });
    };

    setupWatcher();

    return () => {
      if (unwatchFn) {
        unwatchFn();
      }
    };
  }, [currentFilePath, loadFile]);

  // Focus safety net: check mtime when window regains focus
  useEffect(() => {
    if (!currentFilePath) return;

    let unlistenFn: (() => void) | null = null;

    const setupFocusListener = async () => {
      unlistenFn = await listen("window-focused", async () => {
        if (isDirtyRef.current) return;

        try {
          const mtime = await invoke<number>("stat_file", { path: currentFilePath });
          if (mtime > lastMtimeRef.current) {
            lastMtimeRef.current = mtime;
            loadFile(currentFilePath);
          }
        } catch {
          // Ignore stat errors
        }
      });
    };

    setupFocusListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [currentFilePath, loadFile]);
}
