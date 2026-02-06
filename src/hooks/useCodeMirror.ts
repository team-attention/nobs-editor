import { useEffect, useRef, useCallback } from "react";
import { EditorView, lineNumbers, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { EditorState, Extension } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { getLanguageExtension } from "../utils/fileTypes";
import type { FileType } from "../types";

interface UseCodeMirrorOptions {
  fileType: FileType;
  showEditor: boolean;
  filename: string;
  codeContent: string;
  cmViewRef: React.MutableRefObject<EditorView | null>;
  onDocChanged?: () => void;
}

function createEditorView(doc: string, parent: HTMLElement, filename: string, onDocChanged?: () => void): EditorView {
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

  if (onDocChanged) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChanged();
      }
    }));
  }

  return new EditorView({
    state: EditorState.create({ doc, extensions }),
    parent,
  });
}

export function useCodeMirror({ fileType, showEditor, filename, codeContent, cmViewRef, onDocChanged }: UseCodeMirrorOptions) {
  const cmContainerRef = useRef<HTMLDivElement>(null);
  const prevContentRef = useRef<string>("");
  const prevFilenameRef = useRef<string>("");
  const onDocChangedRef = useRef(onDocChanged);
  onDocChangedRef.current = onDocChanged;

  const stableOnDocChanged = useCallback(() => {
    onDocChangedRef.current?.();
  }, []);

  // Initialize CodeMirror editor (only when switching to code mode)
  useEffect(() => {
    if (fileType !== "code" || !showEditor) {
      // Destroy editor when leaving code mode
      if (cmViewRef.current) {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
        prevContentRef.current = "";
        prevFilenameRef.current = "";
      }
      return;
    }

    // Wait for the container to be rendered
    const timer = setTimeout(() => {
      if (!cmContainerRef.current) return;

      // Only recreate if we don't have a view yet
      if (cmViewRef.current) return;

      const view = createEditorView(codeContent, cmContainerRef.current, filename, stableOnDocChanged);
      cmViewRef.current = view;
      prevContentRef.current = codeContent;
      prevFilenameRef.current = filename;
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [fileType, showEditor]); // Only depends on mode switches, not content

  // Update content via transaction when a new file is loaded (content changes externally)
  useEffect(() => {
    if (fileType !== "code" || !showEditor) return;
    if (!cmViewRef.current) return;
    // Skip if content hasn't actually changed
    if (codeContent === prevContentRef.current && filename === prevFilenameRef.current) return;

    const view = cmViewRef.current;

    // If filename changed, we need to recreate for new language extensions
    if (filename !== prevFilenameRef.current) {
      const parent = view.dom.parentElement;
      view.destroy();
      cmViewRef.current = null;

      if (parent) {
        const newView = createEditorView(codeContent, parent, filename, stableOnDocChanged);
        cmViewRef.current = newView;
      }
    } else {
      // Same file type — update content via transaction (preserves cursor/undo)
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: codeContent,
        },
      });
    }

    prevContentRef.current = codeContent;
    prevFilenameRef.current = filename;
  }, [fileType, showEditor, codeContent, filename]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cmViewRef.current?.destroy();
      cmViewRef.current = null;
    };
  }, []);

  return {
    cmContainerRef,
  };
}
