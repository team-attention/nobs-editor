interface FrontmatterPanelProps {
  showFrontmatter: boolean;
  setShowFrontmatter: (show: boolean) => void;
  frontmatterEntries: [string, string][];
  hasFrontmatter: boolean;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onUpdateValue: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}

export function FrontmatterPanel({
  showFrontmatter,
  setShowFrontmatter,
  frontmatterEntries,
  hasFrontmatter,
  onRenameKey,
  onUpdateValue,
  onRemove,
  onAdd,
}: FrontmatterPanelProps) {
  return (
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
                onChange={(e) => onRenameKey(key, e.target.value)}
                placeholder="key"
              />
              <input
                type="text"
                className="frontmatter-value"
                value={value}
                onChange={(e) => onUpdateValue(key, e.target.value)}
                placeholder="value"
              />
              <button
                className="frontmatter-delete"
                onClick={() => onRemove(key)}
                title="Remove property"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          <button className="frontmatter-add" onClick={onAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add property
          </button>
        </div>
      )}
    </div>
  );
}
