# Tools4Tech

A premium, dark-themed developer toolbox — five essential tools in one unified interface. **100% client-side** — no data ever leaves your browser.

## 🛠 Tools Included

| Tool | Description |
|------|-------------|
| **Markdown Editor** | Split-pane editor with live preview, toolbar shortcuts, and HTML export |
| **Regex Tester** | Real-time regex matching with highlighted overlays and match details |
| **Unix Timestamp** | Live epoch clock, epoch↔date conversion (local, UTC, ISO, relative) |
| **URL Parser** | Deconstruct URLs into components with editable query parameters |
| **Cron Schedule** | Build cron expressions, see human-readable descriptions, preview next runs |

## 🚀 Getting Started

No build step required — just open `index.html` in a browser or serve via any static file server:

```bash
# Option 1: Python
python3 -m http.server 8080

# Option 2: Node.js
npx serve .
```

## 📁 Files

- `index.html` — Single-page app structure with all five tool sections
- `style.css` — Design system (dark theme, glassmorphism, responsive)
- `script.js` — All tool logic (navigation, markdown, regex, timestamp, URL, cron)

## ⚙️ External Dependencies

- [marked.js](https://github.com/markedjs/marked) (CDN) — Markdown → HTML rendering
- [Inter](https://fonts.google.com/specimen/Inter) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — Typography (Google Fonts)

## 📄 License

This project is private and proprietary.
