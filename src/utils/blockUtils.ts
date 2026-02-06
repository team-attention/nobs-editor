/**
 * Extract plain text from a BlockNote block recursively.
 * Used for searching within markdown content.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTextFromBlock(block: any): string {
  let text = "";
  if (block.content && Array.isArray(block.content)) {
    for (const inline of block.content) {
      if (typeof inline === "object" && "text" in inline) {
        text += inline.text;
      }
    }
  }
  if (block.children) {
    for (const child of block.children) {
      text += extractTextFromBlock(child);
    }
  }
  return text + "\n";
}
