<!-- A labelled row of mutually exclusive buttons, one of them pressed. -->
<script lang="ts" generics="T extends string | number | boolean">
  interface Props {
    value: T;
    options: Array<{ value: T; label: string }>;
    label: string;
    onChange: (value: T) => void;
  }

  let { value, options, label, onChange }: Props = $props();
</script>

<div class="field">
  <span class="field-label">{label}</span>
  <div class="segment" role="group" aria-label={label}>
    {#each options as option (option.value)}
      <button
        type="button"
        aria-pressed={value === option.value}
        onclick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>
</div>
