import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { EditorView } from "@codemirror/view";
import type { BlockNoteEditor } from "@blocknote/core";
import { getFileType } from "../utils/fileTypes";
import { parseFrontmatter, serializeFrontmatter } from "../utils/frontmatter";
import type { FrontmatterData, FileType } from "../types";

interface UseFileOperationsOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  editorReady: boolean;
  cmViewRef: React.MutableRefObject<EditorView | null>;
  setFrontmatter: (data: FrontmatterData) => void;
  frontmatter: FrontmatterData;
}

export function useFileOperations({
  editor,
  editorReady,
  cmViewRef,
  setFrontmatter,
  frontmatter,
}: UseFileOperationsOptions) {
  const [filename, setFilename] = useState("No file opened");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [fileType, setFileType] = useState<FileType>("markdown");
  const [codeContent, setCodeContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const pendingFile = useRef<string | null>(null);

  const loadFile = useCallback(async (path: string) => {
    // If editor not ready, queue the file
    if (!editorReady) {
      pendingFile.current = path;
      return;
    }

    try {
      const content = await invoke<string>("read_file", { path });
      setCurrentFilePath(path);

      const name = path.split("/").pop() || path;
      setFilename(name);

      const type = getFileType(path);
      setFileType(type);

      if (type === "markdown") {
        // Parse frontmatter and markdown content
        const parsed = parseFrontmatter(content);
        setFrontmatter(parsed.frontmatter);
        const blocks = await editor.tryParseMarkdownToBlocks(parsed.body);
        editor.replaceBlocks(editor.document, blocks);
      } else {
        setFrontmatter({});
        setCodeContent(content);
      }

      setShowEditor(true);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to load file:", error);
      setFilename("Error loading file");
    }
  }, [editor, editorReady, setFrontmatter]);

  // Process pending file when editor becomes ready
  useEffect(() => {
    if (editorReady && pendingFile.current) {
      const file = pendingFile.current;
      pendingFile.current = null;
      loadFile(file);
    }
  }, [editorReady, loadFile]);

  const openFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "JavaScript/TypeScript", extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"] },
        { name: "Python", extensions: ["py", "pyw"] },
        { name: "Web", extensions: ["html", "htm", "css", "scss", "less", "vue", "svelte"] },
        { name: "Systems", extensions: ["rs", "c", "h", "cpp", "hpp", "cc", "cxx", "go"] },
        { name: "Data/Config", extensions: ["json", "yaml", "yml", "toml", "xml", "sql", "csv"] },
        { name: "Shell/Text", extensions: ["sh", "bash", "zsh", "txt", "log", "ini", "cfg", "conf"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (selected && typeof selected === "string") {
      // Open file in a new window (or focus existing window if already open)
      await invoke("open_file", { path: selected });
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!currentFilePath) return;

    try {
      if (fileType === "code") {
        const content = cmViewRef.current?.state.doc.toString() || "";
        await invoke("write_file", { path: currentFilePath, content });
      } else {
        const markdown = await editor.blocksToMarkdownLossy(editor.document);
        const frontmatterStr = serializeFrontmatter(frontmatter);
        await invoke("write_file", { path: currentFilePath, content: frontmatterStr + markdown });
      }
      setIsDirty(false);
      console.log("File saved");
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [currentFilePath, editor, fileType, cmViewRef, frontmatter]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  return {
    filename,
    currentFilePath,
    showEditor,
    fileType,
    codeContent,
    isDirty,
    loadFile,
    openFile,
    saveFile,
    markDirty,
  };
}
