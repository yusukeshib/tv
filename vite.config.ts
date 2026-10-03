import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_PATH || "/tv/",
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      dev: process.env.NODE_ENV !== "production",
      runtimeInjection: false,
    }),
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: false,
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg}"] },
    }),
  ],
});
