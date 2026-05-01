# Kager LLC Projects

This monorepo contains various client-side web tools, utilities, and games developed for the Kager LLC portfolio.

## 🚀 Projects

*   **Local-Convert**: A tool for converting files between formats.
*   **FruitFight**: A browser-based game.
*   **Word-Nexus**: A word puzzle or game.
*   **color-picker**: A utility for selecting and managing colors.
*   **endless-stories**: Programatically stitch together ASMR / Subway Surfers background video with narrated (text-to-voice) reddit threads. Posted to Instagram, YouTube, TikTok feeds.
*   **pdf-assembler**: A tool to merge or assemble PDF documents.
*   **pdf-separator**: A tool to split or extract pages from PDF documents.
*   **qr-code-generator**: A utility to generate custom QR codes.
*   **watermark-remover**: A client-side image processing tool to remove watermarks.

## 🏗 Architecture & Development

This repository uses an **Isolated Monorepo** strategy designed for parallel agentic development. 

*   **Isolation**: Each project directory is completely independent. Avoid relative imports (`../`) to other projects unless a specific shared library is established.
*   **Branching**: Agents and developers should work on feature branches specific to the tool they are modifying (e.g., `agent/fruitfight/add-scoring`).
*   **Roadmap**: Consult the `PRODUCTS_ROADMAP.md` for the current status, deployment plan, and future features for all applications.

## 🌐 Deployment

These applications are client-side only (HTML/CSS/JS) and can be deployed directly to static hosting platforms (like Vercel, Netlify, or GitHub Pages) by specifying the root directory for the corresponding tool.
