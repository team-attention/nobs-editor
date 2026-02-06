import { BlockNoteView } from "@blocknote/mantine";
import type { BlockNoteEditor } from "@blocknote/core";
import { FrontmatterPanel } from "./FrontmatterPanel";

interface MarkdownEditorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  blockStyleVars: React.CSSProperties;
  // Frontmatter props
  showFrontmatter: boolean;
  setShowFrontmatter: (show: boolean) => void;
  frontmatterEntries: [string, string][];
  hasFrontmatter: boolean;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onUpdateValue: (key: string, value: string) => void;
  onRemoveFrontmatter: (key: string) => void;
  onAddFrontmatter: () => void;
}

export function MarkdownEditor({
  editor,
  blockStyleVars,
  showFrontmatter,
  setShowFrontmatter,
  frontmatterEntries,
  hasFrontmatter,
  onRenameKey,
  onUpdateValue,
  onRemoveFrontmatter,
  onAddFrontmatter,
}: MarkdownEditorProps) {
  return (
    <div id="editor-container" style={blockStyleVars}>
      <FrontmatterPanel
        showFrontmatter={showFrontmatter}
        setShowFrontmatter={setShowFrontmatter}
        frontmatterEntries={frontmatterEntries}
        hasFrontmatter={hasFrontmatter}
        onRenameKey={onRenameKey}
        onUpdateValue={onUpdateValue}
        onRemove={onRemoveFrontmatter}
        onAdd={onAddFrontmatter}
      />
      <BlockNoteView editor={editor} />
    </div>
  );
}
