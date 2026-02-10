import { useState, useEffect, useRef, useCallback } from "react";
import { watch } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface UseFileWatcherOptions {
  currentFilePath: string | null;
  isDirty: boolean;
  loadFile: (path: string) => Promise<void>;
}

export function useFileWatcher({ currentFilePath, isDirty, loadFile }: UseFileWatcherOptions) {
  const [hasConflict, setHasConflict] = useState(false);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;

  const lastMtimeRef = useRef<number>(0);
  const reloadingRef = useRef(false);

  const checkAndReload = useCallback(async (path: string) => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    try {
      const mtime = await invoke<number>("stat_file", { path });
      if (mtime > lastMtimeRef.current) {
        lastMtimeRef.current = mtime;
        if (isDirtyRef.current) {
          setHasConflict(true);
        } else {
          await loadFile(path);
        }
      }
    } catch {
      // Ignore stat errors
    } finally {
      reloadingRef.current = false;
    }
  }, [loadFile]);

  // Reset conflict state when file changes or dirty state clears
  useEffect(() => {
    setHasConflict(false);
  }, [currentFilePath]);

  // Initialize mtime + file watcher
  useEffect(() => {
    if (!currentFilePath) return;

    let unwatchFn: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      // Store initial mtime
      try {
        const mtime = await invoke<number>("stat_file", { path: currentFilePath });
        lastMtimeRef.current = mtime;
      } catch {
        // Ignore
      }

      if (cancelled) return;

      // Setup native file watcher
      try {
        unwatchFn = await watch(currentFilePath, () => {
          checkAndReload(currentFilePath);
        }, { delayMs: 500 });
      } catch (error) {
        console.error("File watcher setup failed:", error);
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unwatchFn) unwatchFn();
    };
  }, [currentFilePath, checkAndReload]);

  // Focus-based check (safety net for when watcher misses events)
  useEffect(() => {
    if (!currentFilePath) return;

    const onFocus = () => checkAndReload(currentFilePath);

    const onVisibilityChange = () => {
      if (!document.hidden) checkAndReload(currentFilePath);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let unlistenTauri: (() => void) | null = null;
    getCurrentWindow().listen("window-focused", onFocus).then((fn) => {
      unlistenTauri = fn;
    });

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (unlistenTauri) unlistenTauri();
    };
  }, [currentFilePath, checkAndReload]);

  const acceptExternal = useCallback(async () => {
    const path = currentFilePathRef.current;
    if (path) {
      setHasConflict(false);
      await loadFile(path);
    }
  }, [loadFile]);

  const dismissConflict = useCallback(() => {
    setHasConflict(false);
  }, []);

  return { hasConflict, acceptExternal, dismissConflict };
}
