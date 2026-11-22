<!-- SecretInput is controlled, so a test needs a parent that actually holds state. -->
<script lang="ts">
  import SecretInput from "@/components/SecretInput.svelte";
  import { makeTranslator } from "@/lib/i18n";

  let { onChange }: { onChange?: (v: string) => void } = $props();

  let value = $state("");
</script>

<SecretInput
  label="Token"
  {value}
  t={makeTranslator("en")}
  onChange={(v) => {
    value = v;
    onChange?.(v);
  }}
/>
