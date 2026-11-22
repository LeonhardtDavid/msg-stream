<!--
  Names the source of a message.

  The compact form is a colour-coded two-letter badge rather than the platform's
  own logo. Those logos are trademarks with brand guidelines attached, and a
  redrawn approximation would be a derivative of the mark *and* visibly wrong —
  worse on both counts. To use official artwork instead, see README.md.

  The full name stays as the accessible label either way, so switching to marks
  never costs a screen reader the source.
-->
<script lang="ts">
  import {
    PLATFORM_LABELS,
    PLATFORM_MARKS,
    type Platform,
    type PlatformDisplay,
  } from "@/lib/types";

  let { platform, display }: { platform: Platform; display: PlatformDisplay } = $props();

  const label = $derived(PLATFORM_LABELS[platform]);
</script>

{#if display === "mark"}
  <span class="row-mark" title={label} aria-label={label}>{PLATFORM_MARKS[platform]}</span>
{:else}
  <span class="row-platform">{label}</span>
{/if}
