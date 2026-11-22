<!--
  Renders a chat message with its URLs clickable.

  Everything here goes through Svelte's normal text escaping — the message is
  never treated as markup, and there is no {@html} — so a hostile message can't
  inject anything. Links open in a new tab with `noopener`, which keeps the
  opened page from reaching back into this one via `window.opener`.
-->
<script lang="ts">
  import { parseMessageSegments } from "@/lib/linkify";

  let { text }: { text: string } = $props();

  const segments = $derived(parseMessageSegments(text));
</script>

{#each segments as segment, index (index)}{#if segment.type === "link"}<a
      href={segment.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      class="msg-link">{segment.value}</a
    >{:else}<span>{segment.value}</span>{/if}{/each}
