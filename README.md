# Kager LLC Web Utility Suite

A suite of high-performance, privacy-focused web utilities designed to run 100% in the browser. 

## 🏗 Repository Architecture (Monorepo)

This repository uses **NPM Workspaces** to manage multiple independent projects and shared logic efficiently.

- **`tools4tech/`**: A Vite-based dashboard of developer utilities (JSON, Regex, Base64, etc.).
- **`local-convert/`**: A Next.js application for heavy file conversions (Video, Images, PDFs).
- **`packages/shared/`**: The core logic and localization strings shared across all projects.
- **`utils/`**: Individual standalone tools.

## 🚀 Getting Started

To set up the entire suite for development, follow these steps:

### 1. Global Setup (from the root)
Install dependencies and link the workspaces:
```bash
npm install
```

### 2. Development
You can run any project individually by navigating to its folder:

**For Tools4Tech:**
```bash
cd tools4tech
npm run dev
```

**For Local-Convert:**
```bash
cd local-convert
npm run dev
```

## 🔒 Privacy-First Design
Every tool in this repository follows a strict "zero-server" architecture. All processing happens via WebAssembly, Web Workers, or standard browser APIs inside your browser tab. Your data never leaves your device.
