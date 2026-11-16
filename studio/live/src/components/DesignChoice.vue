<script setup lang="ts">
import { watchEffect } from 'vue'
import { design } from '../lib/look'

// Renders nothing. When a Studio Variants block shows this option, it sets the matching design option.
// watchEffect (not a one-off assignment): switching slots reuses this component and only changes `v`.
const props = defineProps<{ k: 'group' | 'flags' | 'color' | 'addRow' | 'projList' | 'projCard' | 'projPage' | 'projAdd' | 'taskForm' | 'board' | 'search' | 'overview' | 'notes' | 'taskPanel' | 'stats' | 'about' | 'aiCard' | 'chips' | 'msForm' | 'emptyValue' | 'msBar' | 'tableGroup' | 'sidebarFoot' | 'ovLayout' | 'msStrip' | 'panel' | 'notifList' | 'taskSearch' | 'noteList' | 'notePanel' | 'workload' | 'planChart' | 'ownPlace'; v: string }>()
watchEffect(() => {
  design[props.k] = props.v
})
</script>

<template><span hidden /></template>

