interface CodeEditorProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  blockStyleVars: React.CSSProperties;
}

export function CodeEditor({ containerRef, blockStyleVars }: CodeEditorProps) {
  return (
    <div id="codemirror-container" ref={containerRef} style={blockStyleVars} />
  );
}
