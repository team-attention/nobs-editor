import { useState, useCallback, useRef, useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { SearchQuery, setSearchQuery, findNext, findPrevious } from "@codemirror/search";
import type { BlockNoteEditor } from "@blocknote/core";
import { extractTextFromBlock } from "../utils/blockUtils";
import type { FileType } from "../types";

interface UseSearchOptions {
  fileType: FileType;
  cmViewRef: React.MutableRefObject<EditorView | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
}

export function useSearch({ fileType, cmViewRef, editor }: UseSearchOptions) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQueryState] = useState("");
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  }, [fileType, cmViewRef, editor]);

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
  }, [fileType, cmViewRef, searchMatchCount]);

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
  }, [fileType, cmViewRef]);

  // Focus search input when search bar opens
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  return {
    showSearch,
    searchQuery,
    searchMatchCount,
    currentMatchIndex,
    searchInputRef,
    performSearch,
    navigateSearch,
    toggleSearch,
  };
}
