<script setup lang="ts">
import { TextInput } from 'frappe-ui'

// One search field for the whole app (outline, a little taller), so it never looks like a filter or a button.
// No page-level shortcut of its own: Ctrl+K (⌘K on Mac) opens search everywhere, like other Frappe apps.
const q = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string }>()
</script>

<template>
  <TextInput v-model="q" type="search" variant="outline" size="md" :placeholder="placeholder || 'Search'" :aria-label="placeholder || 'Search'">
    <template #prefix><span class="lucide-search size-4 text-ink-gray-5" aria-hidden="true" /></template>
  </TextInput>
</template>
