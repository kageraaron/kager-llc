# GEMINI.md: Parquet to CSV Converter

## Project Vision
To provide a fast, secure, and entirely client-side tool for converting between Apache Parquet and CSV formats. This tool ensures user privacy by processing all data locally in the browser, catering to data scientists and developers who need quick conversions without uploading sensitive data.

## Technical Preferences
- **Frontend:** Vanilla JavaScript, HTML, CSS.
- **Processing:** 
  - [DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview) or [parquet-wasm](https://github.com/kylebarron/parquet-wasm) for high-performance, client-side Parquet processing.
  - PapaParse for robust CSV parsing and generation.
- **Deployment:** Static hosting (Vercel/Netlify).

## Monetization Strategy
- **Ad Banners:** Strategically placed banner ads around the conversion workspace.
- **Interstitial Ads:** Brief ad-rolls during the processing of large files to maximize revenue during wait times.
- **SEO Focus:** Optimize for search terms like "parquet to csv online", "csv to parquet converter", "convert parquet locally", "browser-based parquet viewer".

## Core Features
- Drag-and-drop file upload for .parquet and .csv files.
- Local conversion without server-side processing.
- Basic data preview/table view before download.
- Fast processing using WebAssembly.
