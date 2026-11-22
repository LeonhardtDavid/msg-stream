import { defineConfig, type Plugin } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { themeBootScript } from "./lib/theme.ts";

/**
 * Inlines the pre-paint theme script into index.html. It has to be a classic
 * inline script in <head> — a module would run too late, after first paint —
 * and it's taken from lib/theme.ts so the tests cover exactly what ships.
 */
function themeBoot(): Plugin {
  return {
    name: "theme-boot",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html.replace(/<!-- theme-boot:[\s\S]*?-->/, `<script>${themeBootScript}</script>`),
    },
  };
}

export default defineConfig({
  // svelteTesting only touches the test run: it makes Vitest resolve Svelte's
  // browser build (jsdom is a browser) and unmounts components after each test.
  plugins: [svelte(), svelteTesting(), themeBoot()],
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  // Port 3000 on purpose: the Twitch app's OAuth redirect and the YouTube key's
  // referrer restriction are both registered for http://localhost:3000.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
