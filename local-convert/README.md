# Local Convert

A high-performance, privacy-focused, local-first file conversion web application built with Next.js and TypeScript.

## 🚀 Getting Started

TODO: fix translations, enable a dark mode

### Prerequisites

- **Node.js**: 18.x or later
- **npm**: 9.x or later (or yarn/pnpm)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd local-convert
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## 🛠 Available Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the development server with Hot Module Replacement (HMR). |
| `npm run build` | Compiles the application for production. |
| `npm run start` | Runs the compiled production build. |
| `npm run lint` | Runs ESLint to check for code quality and style issues. |

## 🏗 Architecture & Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Vanilla CSS (for performance and minimal bundle size)
- **Conversion Libraries**:
  - [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) for video processing. (Note: Requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers, which are configured in `next.config.js`).
  - [pdf-lib](https://pdf-lib.js.org/) and [pdfjs-dist](https://mozilla.github.io/pdf.js/) for PDF operations.
  - [heic2any](https://github.com/alexcorvi/heic2any) for HEIC image conversion.

### Core Principles

1. **Privacy First**: All conversions happen client-side in the browser. User files are never uploaded to a server.
2. **SEO Optimized**: Dynamic routing is used to generate optimized landing pages for various conversion pairs (e.g., `/convert/heic-to-png`).
3. **Performance**: Optimized for Core Web Vitals to ensure high search engine ranking and a smooth user experience.

## 📁 Project Structure

- `src/app/`: Next.js App Router pages and layouts.
- `src/components/`: Reusable React components.
- `src/lib/converters/`: Core conversion logic for different file types.
- `public/`: Static assets.

## 📄 License

This project is private and proprietary.
