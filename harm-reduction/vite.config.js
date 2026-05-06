import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

const htmlEntries = Object.fromEntries(
  readdirSync(__dirname)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [file.replace(/\.html$/, ""), resolve(__dirname, file)]),
);

export default defineConfig({
  build: {
    rollupOptions: {
      input: htmlEntries,
    },
  },
});
