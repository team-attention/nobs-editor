interface ConflictBannerProps {
  onReload: () => void;
  onKeep: () => void;
}

export function ConflictBanner({ onReload, onKeep }: ConflictBannerProps) {
  return (
    <div className="conflict-banner">
      <span className="conflict-message">File changed externally</span>
      <div className="conflict-actions">
        <button className="conflict-btn conflict-btn-reload" onClick={onReload}>
          Reload
        </button>
        <button className="conflict-btn conflict-btn-keep" onClick={onKeep}>
          Keep mine
        </button>
      </div>
    </div>
  );
}
