import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Read by the Vite plugin, svelte-check and ESLint alike, so all three compile
// components the same way. vitePreprocess is what lets <script lang="ts"> in.
export default {
  preprocess: vitePreprocess(),
};
