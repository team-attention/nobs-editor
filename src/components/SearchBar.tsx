interface SearchBarProps {
  searchQuery: string;
  searchMatchCount: number;
  currentMatchIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearch: (query: string) => void;
  onNavigate: (direction: "next" | "prev") => void;
  onClose: () => void;
}

export function SearchBar({
  searchQuery,
  searchMatchCount,
  currentMatchIndex,
  searchInputRef,
  onSearch,
  onNavigate,
  onClose,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <div className="style-separator" />
      <input
        ref={searchInputRef}
        type="text"
        className="search-input"
        placeholder="Find..."
        value={searchQuery}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onNavigate(e.shiftKey ? "prev" : "next");
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
        onClick={() => onNavigate("prev")}
        title="Previous match (Shift+Enter)"
        disabled={searchMatchCount === 0}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="18,15 12,9 6,15" />
        </svg>
      </button>
      <button
        className="search-nav-btn"
        onClick={() => onNavigate("next")}
        title="Next match (Enter)"
        disabled={searchMatchCount === 0}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
      <button
        className="search-nav-btn"
        onClick={onClose}
        title="Close search (Escape)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
