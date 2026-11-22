import js from "@eslint/js";
import globals from "globals";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import svelteConfig from "./svelte.config.js";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**", ".wrangler/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Components and rune modules (.svelte.ts) are parsed by the Svelte parser,
    // with TypeScript handling what's inside <script lang="ts">.
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    // Build tooling and the icon generator run under Node, not in the page.
    files: ["*.config.{ts,mts,mjs,js}", "scripts/**"],
    languageOptions: { globals: { ...globals.node } },
  },
]);
