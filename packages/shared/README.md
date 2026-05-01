# @kager-llc/shared

The core logic and localization engine for the Kager LLC web utility suite.

## 📦 What's Inside
- **`/src/lib`**: Pure JavaScript modules for processing logic (Regex, Cron, Markdown, etc.).
- **`/src/translations`**: Centralized JSON files for all supported languages.
- **`i18n.js`**: A shared internationalization manager for client-side use.

## 🏗 Usage
This package is intended to be used as a workspace dependency in other projects within the monorepo:

```json
"dependencies": {
  "@kager-llc/shared": "*"
}
```

By keeping logic here, we ensure that a single fix (e.g., a regex bug or a typo in a translation) propagates to every tool in the suite simultaneously.
