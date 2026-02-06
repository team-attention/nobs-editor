import { useState, useMemo } from "react";
import type { BlockStyles } from "../types";
import { DEFAULT_BLOCK_STYLES } from "../types";

export function useBlockStyles() {
  const [blockStyles, setBlockStyles] = useState<BlockStyles>(DEFAULT_BLOCK_STYLES);

  const updateBlockStyle = (key: keyof BlockStyles, value: number) => {
    setBlockStyles(prev => ({ ...prev, [key]: value }));
  };

  const blockStyleVars = useMemo(() => ({
    "--h1-size": `${blockStyles.h1Size}px`,
    "--h2-size": `${blockStyles.h2Size}px`,
    "--h3-size": `${blockStyles.h3Size}px`,
    "--p-size": `${blockStyles.paragraphSize}px`,
    "--code-size": `${blockStyles.codeSize}px`,
  } as React.CSSProperties), [blockStyles]);

  return {
    blockStyles,
    updateBlockStyle,
    blockStyleVars,
  };
}
