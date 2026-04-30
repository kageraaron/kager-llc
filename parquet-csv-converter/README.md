# Parquet to CSV Converter (and CSV to Parquet)

A high-performance, privacy-focused, 100% client-side tool for converting between Apache Parquet and CSV formats.

## Why this tool?
- **Privacy First:** Your data never leaves your browser. No server uploads, no data collection.
- **Fast:** Powered by WebAssembly for near-native performance.
- **Easy to Use:** Simple drag-and-drop interface.
- **Free:** No hidden costs or limits on file size (limited only by your browser's memory).

## How it works
This tool leverages [DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview) or [parquet-wasm](https://github.com/kylebarron/parquet-wasm) to handle Parquet files directly in your browser. It parses the data and generates a CSV (or vice-versa) using local computing power.

## Features
- Convert .parquet to .csv
- Convert .csv to .parquet
- Instant data preview
- Local processing (no cloud)
