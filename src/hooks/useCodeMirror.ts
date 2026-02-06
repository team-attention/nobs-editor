import { useEffect, useRef } from "react";
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
}

export function useCodeMirror({ fileType, showEditor, filename, codeContent }: UseCodeMirrorOptions) {
  const cmContainerRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);

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

  return {
    cmContainerRef,
    cmViewRef,
  };
}
