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
import { highlightSelectionMatches, SearchQuery, search, findNext, findPrevious, setSearchQuery, getSearchQuery } from "@codemirror/search";

import "./styles.css";

// Frontmatter parsing utilities
interface FrontmatterData {
  [key: string]: string;
}

interface ParsedContent {
  frontmatter: FrontmatterData;
  body: string;
  rawFrontmatter: string;
}

function parseFrontmatter(content: string): ParsedContent {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content, rawFrontmatter: "" };
  }

  const rawFrontmatter = match[1];
  const body = content.slice(match[0].length);
  const frontmatter: FrontmatterData = {};

  // Parse simple key: value pairs (handles strings, numbers, booleans)
  const lines = rawFrontmatter.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove surrounding quotes if present and handle escaped quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body, rawFrontmatter };
}

function serializeFrontmatter(frontmatter: FrontmatterData): string {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return "";

  const lines = entries.map(([key, value]) => {
    // Quote values that contain special characters
    if (value.includes(":") || value.includes("#") || value.includes("\n") ||
        value.startsWith(" ") || value.endsWith(" ")) {
      return `${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${key}: ${value}`;
  });

  return `---\n${lines.join("\n")}\n---\n`;
}

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

// Helper function to extract text from BlockNote blocks (defined outside component to avoid recreation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromBlock(block: any): string {
  let text = "";
  if (block.content && Array.isArray(block.content)) {
    for (const inline of block.content) {
      if (typeof inline === "object" && "text" in inline) {
        text += inline.text;
      }
    }
  }
  if (block.children) {
    for (const child of block.children) {
      text += extractTextFromBlock(child);
    }
  }
  return text + "\n";
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

// Inline style control component for a single style property
interface StyleControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

function StyleControl({ label, value, onChange, min = 10, max = 72 }: StyleControlProps) {
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));

  return (
    <div className="style-control">
      <span className="style-label">{label}</span>
      <button className="style-btn" onClick={decrement} title={`Decrease ${label} size`}>−</button>
      <span className="style-value">{value}</span>
      <button className="style-btn" onClick={increment} title={`Increase ${label} size`}>+</button>
    </div>
  );
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
  const [frontmatter, setFrontmatter] = useState<FrontmatterData>({});
  const [showFrontmatter, setShowFrontmatter] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQueryState] = useState("");
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        // Parse frontmatter and markdown content
        const parsed = parseFrontmatter(content);
        setFrontmatter(parsed.frontmatter);
        const blocks = await editor.tryParseMarkdownToBlocks(parsed.body);
        editor.replaceBlocks(editor.document, blocks);
      } else {
        setFrontmatter({});
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
        search({ top: true }),
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
        const frontmatterStr = serializeFrontmatter(frontmatter);
        await invoke("write_file", { path: currentFilePath, content: frontmatterStr + markdown });
      }
      console.log("File saved");
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [currentFilePath, editor, fileType]);

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

  const updateFrontmatter = (key: string, value: string) => {
    setFrontmatter(prev => ({ ...prev, [key]: value }));
  };

  const addFrontmatterProperty = () => {
    let i = 1;
    let newKey = "new-property";
    while (Object.prototype.hasOwnProperty.call(frontmatter, newKey)) {
      newKey = `new-property-${i++}`;
    }
    setFrontmatter(prev => ({ ...prev, [newKey]: "" }));
  };

  const removeFrontmatterProperty = (key: string) => {
    setFrontmatter(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const renameFrontmatterKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || !newKey.trim()) return;
    setFrontmatter(prev => {
      if (Object.prototype.hasOwnProperty.call(prev, newKey)) {
        return prev; // newKey already exists, abort
      }
      const entries = Object.entries(prev);
      const updated: FrontmatterData = {};
      for (const [k, v] of entries) {
        updated[k === oldKey ? newKey : k] = v;
      }
      return updated;
    });
  };

  const frontmatterEntries = Object.entries(frontmatter);
  const hasFrontmatter = frontmatterEntries.length > 0;

  // Search functionality
  const performSearch = useCallback((query: string) => {
    setSearchQueryState(query);

    if (!query) {
      setSearchMatchCount(0);
      setCurrentMatchIndex(0);
      // Clear CodeMirror search
      if (fileType === "code" && cmViewRef.current) {
        cmViewRef.current.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: "" }))
        });
      }
      return;
    }

    if (fileType === "code" && cmViewRef.current) {
      // CodeMirror search
      const searchQueryObj = new SearchQuery({ search: query, caseSensitive: false });
      cmViewRef.current.dispatch({
        effects: setSearchQuery.of(searchQueryObj)
      });

      // Count matches
      const cursor = searchQueryObj.getCursor(cmViewRef.current.state);
      let count = 0;
      while (!cursor.next().done) count++;
      setSearchMatchCount(count);
      setCurrentMatchIndex(count > 0 ? 1 : 0);

      // Move to first match
      if (count > 0) {
        findNext(cmViewRef.current);
      }
    } else if (fileType === "markdown") {
      // BlockNote search - get text content and count matches
      const blocks = editor.document;
      let totalText = "";
      for (const block of blocks) {
        totalText += extractTextFromBlock(block);
      }

      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = totalText.match(regex);
      const count = matches ? matches.length : 0;
      setSearchMatchCount(count);
      setCurrentMatchIndex(count > 0 ? 1 : 0);
    }
  }, [fileType, editor]);

  const navigateSearch = useCallback((direction: "next" | "prev") => {
    if (searchMatchCount === 0) return;

    // CodeMirror-specific navigation
    if (fileType === "code" && cmViewRef.current) {
      if (direction === "next") {
        findNext(cmViewRef.current);
      } else {
        findPrevious(cmViewRef.current);
      }
    }

    // Update index for visual feedback (applies to both editor types)
    if (direction === "next") {
      setCurrentMatchIndex(prev => prev >= searchMatchCount ? 1 : prev + 1);
    } else {
      setCurrentMatchIndex(prev => prev <= 1 ? searchMatchCount : prev - 1);
    }
  }, [fileType, searchMatchCount]);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      const willShow = !prev;
      if (!willShow) {
        // Cleanup when hiding search
        setSearchQueryState("");
        setSearchMatchCount(0);
        setCurrentMatchIndex(0);
        if (fileType === "code" && cmViewRef.current) {
          cmViewRef.current.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" }))
          });
        }
      }
      return willShow;
    });
  }, [fileType]);

  // Focus search input when search bar opens
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

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

  return (
    <div id="app">
      <header id="toolbar">
        <button id="open-btn" title="Open File (Cmd+O)" onClick={openFile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
        </button>
        <span id="filename">{filename}</span>
        {showEditor && showSearch && (
          <div className="search-bar">
            <div className="style-separator" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Find..."
              value={searchQuery}
              onChange={(e) => performSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  navigateSearch(e.shiftKey ? "prev" : "next");
                }
              }}
            />
            {searchQuery && (
              <span className="search-count">
                {searchMatchCount > 0 ? `${currentMatchIndex}/${searchMatchCount}` : "0"}
              </span>
            )}
            <button
              className="search-nav-btn"
              onClick={() => navigateSearch("prev")}
              title="Previous match (Shift+Enter)"
              disabled={searchMatchCount === 0}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18,15 12,9 6,15" />
              </svg>
            </button>
            <button
              className="search-nav-btn"
              onClick={() => navigateSearch("next")}
              title="Next match (Enter)"
              disabled={searchMatchCount === 0}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
            <button
              className="search-nav-btn"
              onClick={toggleSearch}
              title="Close search (Escape)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {showEditor && (
          <div className="inline-style-bar">
            <div className="style-separator" />
            {fileType === "markdown" ? (
              <>
                <StyleControl label="H1" value={blockStyles.h1Size} onChange={(v) => updateBlockStyle("h1Size", v)} />
                <StyleControl label="H2" value={blockStyles.h2Size} onChange={(v) => updateBlockStyle("h2Size", v)} />
                <StyleControl label="H3" value={blockStyles.h3Size} onChange={(v) => updateBlockStyle("h3Size", v)} />
                <StyleControl label="P" value={blockStyles.paragraphSize} onChange={(v) => updateBlockStyle("paragraphSize", v)} />
                <StyleControl label="Code" value={blockStyles.codeSize} onChange={(v) => updateBlockStyle("codeSize", v)} />
              </>
            ) : (
              <StyleControl label="Code" value={blockStyles.codeSize} onChange={(v) => updateBlockStyle("codeSize", v)} />
            )}
          </div>
        )}
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
            <div className="frontmatter-panel">
              <button
                className="frontmatter-toggle"
                onClick={() => setShowFrontmatter(!showFrontmatter)}
                title={showFrontmatter ? "Collapse properties" : "Expand properties"}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ transform: showFrontmatter ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                >
                  <polyline points="9,18 15,12 9,6" />
                </svg>
                <span>Properties {hasFrontmatter ? `(${frontmatterEntries.length})` : ""}</span>
              </button>
              {showFrontmatter && (
                <div className="frontmatter-content">
                  {frontmatterEntries.map(([key, value], index) => (
                    <div key={index} className="frontmatter-row">
                      <input
                        type="text"
                        className="frontmatter-key"
                        value={key}
                        onChange={(e) => renameFrontmatterKey(key, e.target.value)}
                        placeholder="key"
                      />
                      <input
                        type="text"
                        className="frontmatter-value"
                        value={value}
                        onChange={(e) => updateFrontmatter(key, e.target.value)}
                        placeholder="value"
                      />
                      <button
                        className="frontmatter-delete"
                        onClick={() => removeFrontmatterProperty(key)}
                        title="Remove property"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button className="frontmatter-add" onClick={addFrontmatterProperty}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add property
                  </button>
                </div>
              )}
            </div>
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
