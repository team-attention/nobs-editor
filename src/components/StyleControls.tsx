import { memo } from "react";
import type { BlockStyles, FileType } from "../types";

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

interface StyleControlsProps {
  blockStyles: BlockStyles;
  fileType: FileType;
  onStyleChange: (key: keyof BlockStyles, value: number) => void;
}

export const StyleControls = memo(function StyleControls({ blockStyles, fileType, onStyleChange }: StyleControlsProps) {
  return (
    <div className="inline-style-bar">
      <div className="style-separator" />
      {fileType === "markdown" ? (
        <>
          <StyleControl label="H1" value={blockStyles.h1Size} onChange={(v) => onStyleChange("h1Size", v)} />
          <StyleControl label="H2" value={blockStyles.h2Size} onChange={(v) => onStyleChange("h2Size", v)} />
          <StyleControl label="H3" value={blockStyles.h3Size} onChange={(v) => onStyleChange("h3Size", v)} />
          <StyleControl label="P" value={blockStyles.paragraphSize} onChange={(v) => onStyleChange("paragraphSize", v)} />
          <StyleControl label="Code" value={blockStyles.codeSize} onChange={(v) => onStyleChange("codeSize", v)} />
        </>
      ) : (
        <StyleControl label="Code" value={blockStyles.codeSize} onChange={(v) => onStyleChange("codeSize", v)} />
      )}
    </div>
  );
});
