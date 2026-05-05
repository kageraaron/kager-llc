import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        mdma: resolve(__dirname, "mdma.html"),
        hearing: resolve(__dirname, "hearing.html"),
        faq: resolve(__dirname, "faq.html"),
      },
    },
  },
});
