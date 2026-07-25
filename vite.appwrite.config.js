import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/lib/appwrite-ping.js",
      formats: ["es"],
      fileName: () => "appwrite-client.js",
    },
    outDir: "dist/assets/js",
  },
});
