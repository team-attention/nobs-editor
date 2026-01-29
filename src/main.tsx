import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
// Use native Rust commands for file I/O (bypass fs plugin scope restrictions)
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

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
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";
import { highlightSelectionMatches } from "@codemirror/search";

import "./styles.css";

// Block styles customization
interface BlockStyles {
  h1Size: number;
  h2Size: number;
  h3Size: number;
  paragraphSize: number;
  codeSize: number;
}

const DEFAULT_BLOCK_STYLES: BlockStyles = {
  h1Size: 28,
  h2Size: 22,
  h3Size: 18,
  paragraphSize: 15,
  codeSize: 14,
};

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
    case "js": case "jsx": case "mjs": case "cjs": return javascript();
    case "ts": case "tsx": return javascript({ typescript: true });
    case "py": case "pyw": return python();
    case "css": case "scss": case "less": return css();
    case "html": case "htm": case "vue": case "svelte": return html();
    case "rs": return rust();
    case "c": case "h": case "cpp": case "hpp": case "cc": case "cxx": return cpp();
    case "go": return go();
    case "sql": return sql();
    case "sh": case "bash": case "zsh": return StreamLanguage.define(shell);
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
  const [blockStyles, setBlockStyles] = useState<BlockStyles>(DEFAULT_BLOCK_STYLES);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const stylePanelRef = useRef<HTMLDivElement>(null);

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
        { name: "JavaScript/TypeScript", extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"] },
        { name: "Python", extensions: ["py", "pyw"] },
        { name: "Web", extensions: ["html", "htm", "css", "scss", "less", "vue", "svelte"] },
        { name: "Systems", extensions: ["rs", "c", "h", "cpp", "hpp", "cc", "cxx", "go"] },
        { name: "Data/Config", extensions: ["json", "yaml", "yml", "toml", "xml", "sql", "csv"] },
        { name: "Shell/Text", extensions: ["sh", "bash", "zsh", "txt", "log", "ini", "cfg", "conf"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (selected && typeof selected === "string") {
      // Open file in a new window (or focus existing window if already open)
      await invoke("open_file", { path: selected });
    }
  }, []);

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
    // Read file path from URL query parameter (passed by Rust backend)
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

  // Close style panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showStylePanel && stylePanelRef.current && !stylePanelRef.current.contains(e.target as Node)) {
        const btn = document.getElementById("style-settings-btn");
        if (btn && !btn.contains(e.target as Node)) {
          setShowStylePanel(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStylePanel]);

  const updateBlockStyle = (key: keyof BlockStyles, value: number) => {
    setBlockStyles(prev => ({ ...prev, [key]: value }));
  };

  const blockStyleVars = {
    "--h1-size": `${blockStyles.h1Size}px`,
    "--h2-size": `${blockStyles.h2Size}px`,
    "--h3-size": `${blockStyles.h3Size}px`,
    "--p-size": `${blockStyles.paragraphSize}px`,
    "--code-size": `${blockStyles.codeSize}px`,
  } as React.CSSProperties;

  return (
    <div id="app">
      <header id="toolbar">
        <button id="open-btn" title="Open File (Cmd+O)" onClick={openFile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
        </button>
        <span id="filename">{filename}</span>
        <div className="toolbar-style-wrapper">
          <button
            id="style-settings-btn"
            title="Style Settings"
            onClick={() => setShowStylePanel(!showStylePanel)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          {showStylePanel && (
            <div className="style-panel" ref={stylePanelRef}>
              <div className="style-panel-title">Font Sizes</div>
              <label>
                <span>Heading 1</span>
                <input
                  type="number"
                  value={blockStyles.h1Size}
                  onChange={(e) => updateBlockStyle("h1Size", Number(e.target.value))}
                  min="10"
                  max="72"
                />
              </label>
              <label>
                <span>Heading 2</span>
                <input
                  type="number"
                  value={blockStyles.h2Size}
                  onChange={(e) => updateBlockStyle("h2Size", Number(e.target.value))}
                  min="10"
                  max="72"
                />
              </label>
              <label>
                <span>Heading 3</span>
                <input
                  type="number"
                  value={blockStyles.h3Size}
                  onChange={(e) => updateBlockStyle("h3Size", Number(e.target.value))}
                  min="10"
                  max="72"
                />
              </label>
              <label>
                <span>Paragraph</span>
                <input
                  type="number"
                  value={blockStyles.paragraphSize}
                  onChange={(e) => updateBlockStyle("paragraphSize", Number(e.target.value))}
                  min="10"
                  max="72"
                />
              </label>
              <label>
                <span>Code</span>
                <input
                  type="number"
                  value={blockStyles.codeSize}
                  onChange={(e) => updateBlockStyle("codeSize", Number(e.target.value))}
                  min="10"
                  max="72"
                />
              </label>
            </div>
          )}
        </div>
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
          <div id="editor-container" style={blockStyleVars}>
            <BlockNoteView editor={editor} />
          </div>
        ) : (
          <div id="codemirror-container" ref={cmContainerRef} style={blockStyleVars} />
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
