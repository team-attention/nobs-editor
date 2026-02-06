// Frontmatter data structure for markdown files
export interface FrontmatterData {
  [key: string]: string;
}

// Parsed content from a markdown file with frontmatter
export interface ParsedContent {
  frontmatter: FrontmatterData;
  body: string;
  rawFrontmatter: string;
}

// Block style settings for the editor
export interface BlockStyles {
  h1Size: number;
  h2Size: number;
  h3Size: number;
  paragraphSize: number;
  codeSize: number;
}

// Default block style values
export const DEFAULT_BLOCK_STYLES: BlockStyles = {
  h1Size: 28,
  h2Size: 22,
  h3Size: 18,
  paragraphSize: 15,
  codeSize: 14,
};

// File type enum
export type FileType = "markdown" | "code";
