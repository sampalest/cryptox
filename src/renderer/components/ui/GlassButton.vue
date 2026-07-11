<template>
  <button
    class="lk-btn"
    :class="variant === 'primary' ? 'lk-btn-primary' : 'lk-btn-glass'"
    :type="type"
    @click="$emit('click', $event)"
  >
    <span class="lk-btn-inner"><slot /></span>
  </button>
</template>
<script>
export default {
    name: "GlassButton",
    props: {
        variant: {
            type: String,
            default: "primary",
            validator: (value) => ["primary", "glass"].includes(value)
        },
        type: {
            type: String,
            default: "button"
        }
    },
    emits: ["click"]
};
</script>
