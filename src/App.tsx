import { useState, useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import type { EditorView } from "@codemirror/view";
import "@blocknote/mantine/style.css";

import { useBlockStyles } from "./hooks/useBlockStyles";
import { useFrontmatter } from "./hooks/useFrontmatter";
import { useCodeMirror } from "./hooks/useCodeMirror";
import { useFileOperations } from "./hooks/useFileOperations";
import { useSearch } from "./hooks/useSearch";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { useWindowEvents } from "./hooks/useWindowEvents";

import { Toolbar } from "./components/Toolbar";
import { EmptyState } from "./components/EmptyState";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { CodeEditor } from "./components/CodeEditor";

import "./styles/index.css";

export function App() {
  const [editorReady, setEditorReady] = useState(false);
  const cmViewRef = useRef<EditorView | null>(null);

  // Initialize BlockNote editor
  const editor = useCreateBlockNote({
    schema: BlockNoteSchema.create().extend({
      blockSpecs: {
        codeBlock: createCodeBlockSpec(codeBlockOptions),
      },
    }),
  });

  // Mark editor as ready after first render
  useEffect(() => {
    setEditorReady(true);
  }, []);

  // Custom hooks for state management
  const { blockStyles, updateBlockStyle, blockStyleVars } = useBlockStyles();

  const {
    frontmatter,
    setFrontmatter,
    showFrontmatter,
    setShowFrontmatter,
    updateFrontmatter,
    addFrontmatterProperty,
    removeFrontmatterProperty,
    renameFrontmatterKey,
    frontmatterEntries,
    hasFrontmatter,
  } = useFrontmatter();

  // File operations
  const {
    filename,
    currentFilePath,
    showEditor,
    fileType,
    codeContent,
    isDirty,
    markDirty,
    loadFile,
    openFile,
    saveFile,
  } = useFileOperations({
    editor,
    editorReady,
    cmViewRef,
    setFrontmatter,
    frontmatter,
  });

  // Mark dirty when BlockNote content changes
  useEffect(() => {
    if (!editorReady || fileType !== "markdown") return;
    return editor.onChange(() => {
      markDirty();
    });
  }, [editor, editorReady, fileType, markDirty]);

  // CodeMirror setup - pass values directly from useFileOperations
  const { cmContainerRef } = useCodeMirror({
    fileType,
    showEditor,
    filename,
    codeContent,
    cmViewRef,
    onDocChanged: markDirty,
  });

  // Search functionality
  const {
    showSearch,
    searchQuery,
    searchMatchCount,
    currentMatchIndex,
    searchInputRef,
    performSearch,
    navigateSearch,
    toggleSearch,
  } = useSearch({ fileType, cmViewRef, editor });

  // Window events (keyboard shortcuts, close handler)
  useWindowEvents({
    loadFile,
    openFile,
    saveFile,
    showSearch,
    toggleSearch,
  });

  // File watcher (auto-reload on external changes)
  useFileWatcher({ currentFilePath, isDirty, loadFile });

  return (
    <div id="app">
      <Toolbar
        filename={filename}
        showEditor={showEditor}
        fileType={fileType}
        blockStyles={blockStyles}
        onStyleChange={updateBlockStyle}
        onOpenFile={openFile}
        showSearch={showSearch}
        searchQuery={searchQuery}
        searchMatchCount={searchMatchCount}
        currentMatchIndex={currentMatchIndex}
        searchInputRef={searchInputRef}
        onSearch={performSearch}
        onNavigateSearch={navigateSearch}
        onToggleSearch={toggleSearch}
      />

      <main id="content">
        {!showEditor ? (
          <EmptyState onOpenFile={openFile} />
        ) : fileType === "markdown" ? (
          <MarkdownEditor
            editor={editor}
            blockStyleVars={blockStyleVars}
            showFrontmatter={showFrontmatter}
            setShowFrontmatter={setShowFrontmatter}
            frontmatterEntries={frontmatterEntries}
            hasFrontmatter={hasFrontmatter}
            onRenameKey={renameFrontmatterKey}
            onUpdateValue={updateFrontmatter}
            onRemoveFrontmatter={removeFrontmatterProperty}
            onAddFrontmatter={addFrontmatterProperty}
          />
        ) : (
          <CodeEditor
            containerRef={cmContainerRef}
            blockStyleVars={blockStyleVars}
          />
        )}
      </main>
    </div>
  );
}
