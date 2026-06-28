import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { miserlyInstaller } from "./scripts/vite-plugin-installer.mjs";

export default defineConfig({
  // miserlyInstaller is a dev-only plugin (apply: "serve") that powers the
  // in-app "Install" button. It is inert in production builds.
  plugins: [react(), miserlyInstaller()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
