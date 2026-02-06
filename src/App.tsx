import { useState, useEffect } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import "@blocknote/mantine/style.css";

import type { FileType } from "./types";
import { useBlockStyles } from "./hooks/useBlockStyles";
import { useFrontmatter } from "./hooks/useFrontmatter";
import { useCodeMirror } from "./hooks/useCodeMirror";
import { useFileOperations } from "./hooks/useFileOperations";
import { useSearch } from "./hooks/useSearch";
import { useWindowEvents } from "./hooks/useWindowEvents";

import { Toolbar } from "./components/Toolbar";
import { EmptyState } from "./components/EmptyState";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { CodeEditor } from "./components/CodeEditor";

import "./styles/index.css";

interface CodeState {
  fileType: FileType;
  showEditor: boolean;
  filename: string;
  codeContent: string;
}

export function App() {
  const [editorReady, setEditorReady] = useState(false);

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

  // CodeMirror setup - needs fileType and showEditor from file operations
  // We'll initialize these after useFileOperations, so we need to handle the dependency
  const [codeState, setCodeState] = useState<CodeState>({ fileType: "markdown", showEditor: false, filename: "", codeContent: "" });

  const { cmContainerRef, cmViewRef } = useCodeMirror({
    fileType: codeState.fileType,
    showEditor: codeState.showEditor,
    filename: codeState.filename,
    codeContent: codeState.codeContent,
  });

  // File operations
  const {
    filename,
    currentFilePath,
    showEditor,
    fileType,
    codeContent,
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

  // Sync code state for CodeMirror
  useEffect(() => {
    setCodeState({ fileType, showEditor, filename, codeContent });
  }, [fileType, showEditor, filename, codeContent]);

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

  // Window events (keyboard shortcuts, close handler, focus reload)
  useWindowEvents({
    currentFilePath,
    loadFile,
    openFile,
    saveFile,
    showSearch,
    toggleSearch,
  });

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
