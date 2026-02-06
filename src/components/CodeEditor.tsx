import { memo } from "react";

interface CodeEditorProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  blockStyleVars: React.CSSProperties;
}

export const CodeEditor = memo(function CodeEditor({ containerRef, blockStyleVars }: CodeEditorProps) {
  return (
    <div id="codemirror-container" ref={containerRef} style={blockStyleVars} />
  );
});
