import { useState, useMemo } from "react";
import type { FrontmatterData } from "../types";

export function useFrontmatter() {
  const [frontmatter, setFrontmatter] = useState<FrontmatterData>({});
  const [showFrontmatter, setShowFrontmatter] = useState(false);

  const updateFrontmatter = (key: string, value: string) => {
    setFrontmatter(prev => ({ ...prev, [key]: value }));
  };

  const addFrontmatterProperty = () => {
    let i = 1;
    let newKey = "new-property";
    while (Object.prototype.hasOwnProperty.call(frontmatter, newKey)) {
      newKey = `new-property-${i++}`;
    }
    setFrontmatter(prev => ({ ...prev, [newKey]: "" }));
  };

  const removeFrontmatterProperty = (key: string) => {
    setFrontmatter(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const renameFrontmatterKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || !newKey.trim()) return;
    setFrontmatter(prev => {
      if (Object.prototype.hasOwnProperty.call(prev, newKey)) {
        return prev; // newKey already exists, abort
      }
      const entries = Object.entries(prev);
      const updated: FrontmatterData = {};
      for (const [k, v] of entries) {
        updated[k === oldKey ? newKey : k] = v;
      }
      return updated;
    });
  };

  const frontmatterEntries = useMemo(() => Object.entries(frontmatter), [frontmatter]);
  const hasFrontmatter = frontmatterEntries.length > 0;

  return {
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
  };
}
