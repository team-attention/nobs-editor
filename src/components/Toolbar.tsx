import { memo } from "react";
import type { BlockStyles, FileType } from "../types";
import { SearchBar } from "./SearchBar";
import { StyleControls } from "./StyleControls";

interface ToolbarProps {
  filename: string;
  showEditor: boolean;
  fileType: FileType;
  blockStyles: BlockStyles;
  onStyleChange: (key: keyof BlockStyles, value: number) => void;
  onOpenFile: () => void;
  // Search props
  showSearch: boolean;
  searchQuery: string;
  searchMatchCount: number;
  currentMatchIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearch: (query: string) => void;
  onNavigateSearch: (direction: "next" | "prev") => void;
  onToggleSearch: () => void;
}

export const Toolbar = memo(function Toolbar({
  filename,
  showEditor,
  fileType,
  blockStyles,
  onStyleChange,
  onOpenFile,
  showSearch,
  searchQuery,
  searchMatchCount,
  currentMatchIndex,
  searchInputRef,
  onSearch,
  onNavigateSearch,
  onToggleSearch,
}: ToolbarProps) {
  return (
    <header id="toolbar">
      <button id="open-btn" title="Open File (Cmd+O)" onClick={onOpenFile}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
      </button>
      <span id="filename">{filename}</span>
      {showEditor && showSearch && (
        <SearchBar
          searchQuery={searchQuery}
          searchMatchCount={searchMatchCount}
          currentMatchIndex={currentMatchIndex}
          searchInputRef={searchInputRef}
          onSearch={onSearch}
          onNavigate={onNavigateSearch}
          onClose={onToggleSearch}
        />
      )}
      {showEditor && (
        <StyleControls
          blockStyles={blockStyles}
          fileType={fileType}
          onStyleChange={onStyleChange}
        />
      )}
      <div className="spacer"></div>
    </header>
  );
});
