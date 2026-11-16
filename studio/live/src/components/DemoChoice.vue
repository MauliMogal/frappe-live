<script setup lang="ts">
import { watchEffect } from 'vue'
import { demo } from '../lib/variants'

// Renders nothing. When a Studio Variants block shows this option, it sets the matching demo state
// (e.g. k="Connection" v="Offline"). Like DesignChoice, but for useDemoState.
const props = defineProps<{ k: string; v: string }>()
watchEffect(() => {
  demo[props.k] = props.v
})
</script>

<template><span hidden /></template>
