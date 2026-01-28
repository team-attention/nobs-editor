import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
// Use native Rust commands for file I/O (bypass fs plugin scope restrictions)
import { getCurrentWindow } from "@tauri-apps/api/window";

import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";

import { EditorView, lineNumbers, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { EditorState, Extension } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { oneDark } from "@codemirror/theme-one-dark";
import { highlightSelectionMatches } from "@codemirror/search";

import "./styles.css";

function getFileType(path: string): "markdown" | "code" {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "code";
}

function getLanguageExtension(filename: string): Extension {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "json": return json();
    case "yaml": case "yml": return yaml();
    case "xml": return xml();
    default: return [];
  }
}

function App() {
  const [filename, setFilename] = useState("No file opened");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [fileType, setFileType] = useState<"markdown" | "code">("markdown");
  const [codeContent, setCodeContent] = useState("");
  const pendingFile = useRef<string | null>(null);
  const cmContainerRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);

  const editor = useCreateBlockNote();

  // Mark editor as ready after first render
  useEffect(() => {
    setEditorReady(true);
  }, []);

  const loadFile = useCallback(async (path: string) => {
    // If editor not ready, queue the file
    if (!editorReady) {
      pendingFile.current = path;
      return;
    }

    try {
      const content = await invoke<string>("read_file", { path });
      setCurrentFilePath(path);

      const name = path.split("/").pop() || path;
      setFilename(name);

      const type = getFileType(path);
      setFileType(type);

      if (type === "markdown") {
        // Parse markdown and set content
        const blocks = await editor.tryParseMarkdownToBlocks(content);
        editor.replaceBlocks(editor.document, blocks);
      } else {
        setCodeContent(content);
      }

      setShowEditor(true);
    } catch (error) {
      console.error("Failed to load file:", error);
      setFilename("Error loading file");
    }
  }, [editor, editorReady]);

  // CodeMirror setup effect
  useEffect(() => {
    if (fileType !== "code" || !showEditor) return;

    // Wait for the container to be rendered
    const timer = setTimeout(() => {
      if (!cmContainerRef.current) return;

      // Destroy previous instance
      cmViewRef.current?.destroy();
      cmViewRef.current = null;

      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        getLanguageExtension(filename),
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.lineWrapping,
      ];

      if (isDark) {
        extensions.push(oneDark);
      }

      const view = new EditorView({
        state: EditorState.create({
          doc: codeContent,
          extensions,
        }),
        parent: cmContainerRef.current,
      });

      cmViewRef.current = view;
    }, 0);

    return () => {
      clearTimeout(timer);
      cmViewRef.current?.destroy();
      cmViewRef.current = null;
    };
  }, [fileType, codeContent, showEditor, filename]);

  // Process pending file when editor becomes ready
  useEffect(() => {
    if (editorReady && pendingFile.current) {
      const file = pendingFile.current;
      pendingFile.current = null;
      loadFile(file);
    }
  }, [editorReady, loadFile]);

  const openFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "Text Files", extensions: ["txt", "json", "yaml", "yml", "toml", "xml", "log", "ini", "cfg", "conf", "csv"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (selected && typeof selected === "string") {
      await loadFile(selected);
    }
  }, [loadFile]);

  const saveFile = useCallback(async () => {
    if (!currentFilePath) return;

    try {
      if (fileType === "code") {
        const content = cmViewRef.current?.state.doc.toString() || "";
        await invoke("write_file", { path: currentFilePath, content });
      } else {
        const markdown = await editor.blocksToMarkdownLossy(editor.document);
        await invoke("write_file", { path: currentFilePath, content: markdown });
      }
      console.log("File saved");
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [currentFilePath, editor, fileType]);

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "o") {
          e.preventDefault();
          openFile();
        } else if (e.key === "s") {
          e.preventDefault();
          saveFile();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFile, saveFile]);

  useEffect(() => {
    // Listen for file-opened events from Rust
    const unlisten = listen<string>("file-opened", async (event) => {
      await loadFile(event.payload);
    });

    // Check for files opened before frontend was ready
    (async () => {
      const openedFiles = await invoke<string[]>("get_opened_files");
      if (openedFiles.length > 0) {
        await loadFile(openedFiles[0]);
        await invoke("clear_opened_files");
      }
    })();

    return () => {
      unlisten.then(fn => fn());
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

  return (
    <div id="app">
      <header id="toolbar">
        <button id="open-btn" title="Open File (Cmd+O)" onClick={openFile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
        </button>
        <span id="filename">{filename}</span>
        <div className="spacer"></div>
      </header>

      <main id="content">
        {!showEditor ? (
          <div id="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            <p>Open a file to get started</p>
            <button id="empty-open-btn" onClick={openFile}>Open File</button>
          </div>
        ) : fileType === "markdown" ? (
          <div id="editor-container">
            <BlockNoteView editor={editor} />
          </div>
        ) : (
          <div id="codemirror-container" ref={cmContainerRef} />
        )}
      </main>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
