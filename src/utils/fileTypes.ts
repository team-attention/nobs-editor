import type { Extension } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

import type { FileType } from "../types";

/**
 * Determine file type from path/filename.
 */
export function getFileType(path: string): FileType {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "code";
}

/**
 * Get the appropriate CodeMirror language extension for a file.
 */
export function getLanguageExtension(filename: string): Extension {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "json": return json();
    case "yaml": case "yml": return yaml();
    case "xml": return xml();
    case "js": case "jsx": case "mjs": case "cjs": return javascript();
    case "ts": case "tsx": return javascript({ typescript: true });
    case "py": case "pyw": return python();
    case "css": case "scss": case "less": return css();
    case "html": case "htm": case "vue": case "svelte": return html();
    case "rs": return rust();
    case "c": case "h": case "cpp": case "hpp": case "cc": case "cxx": return cpp();
    case "go": return go();
    case "sql": return sql();
    case "sh": case "bash": case "zsh": return StreamLanguage.define(shell);
    default: return [];
  }
}
