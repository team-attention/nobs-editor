import type { FrontmatterData, ParsedContent } from "../types";

/**
 * Parse frontmatter from a markdown file.
 * Extracts YAML-style key: value pairs between --- delimiters.
 */
export function parseFrontmatter(content: string): ParsedContent {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content, rawFrontmatter: "" };
  }

  const rawFrontmatter = match[1];
  const body = content.slice(match[0].length);
  const frontmatter: FrontmatterData = {};

  // Parse simple key: value pairs (handles strings, numbers, booleans)
  const lines = rawFrontmatter.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove surrounding quotes if present and handle escaped quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body, rawFrontmatter };
}

/**
 * Serialize frontmatter data back to YAML format.
 */
export function serializeFrontmatter(frontmatter: FrontmatterData): string {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return "";

  const lines = entries.map(([key, value]) => {
    // Quote values that contain special characters
    if (value.includes(":") || value.includes("#") || value.includes("\n") ||
        value.startsWith(" ") || value.endsWith(" ")) {
      return `${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${key}: ${value}`;
  });

  return `---\n${lines.join("\n")}\n---\n`;
}
