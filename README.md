# Nobs Editor

Lightweight doc viewer for macOS. Markdown, JSON, YAML, whatever. No bloated IDE needed.

## Download

**[Download Latest Release](https://github.com/team-attention/nobs-editor/releases/latest)**

## How to Use

1. Open Nobs Editor
2. Open a file (Cmd+O or drag & drop)
3. Edit inline if needed
4. Save (Cmd+S)

Or right-click any file in Finder → Open With → Nobs Editor

## Supported Formats

`.md`, `.markdown`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`, `.xml`, `.log`, `.ini`, `.cfg`, `.conf`, `.csv`

## Features

* **Notion-style Editor** - WYSIWYG editing with BlockNote
* **Dark Mode** - Follows system theme
* **Keyboard Shortcuts** - Cmd+O (open), Cmd+S (save)
* **Slash Commands** - Type `/` for formatting options

## Requirements

* macOS 10.15+

## Build

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # production
```

## Tech Stack

* [Tauri](https://tauri.app/) - Rust + Web frontend
* [BlockNote](https://www.blocknotejs.org/) - Notion-style editor
* [React](https://react.dev/) - Frontend

## License

MIT
