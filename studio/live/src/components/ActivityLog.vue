<script setup lang="ts">
import { ref, computed } from 'vue'
import { personName } from '../lib/store'
import { relTime } from '../lib/dates'

// Every change, with who and when. Collapsed by default.
// bare: used inside a tab, so always open, no toggle.
const props = defineProps<{ items: any[]; bare?: boolean }>()
const open = ref(!!props.bare)
const list = computed(() => [...props.items].reverse())
</script>

<template>
  <section v-if="items.length" aria-label="Activity">
    <button
      v-if="!bare"
      type="button"
      class="flex items-center gap-1 text-sm text-ink-gray-5 hover:text-ink-gray-8"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span :class="open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-3.5" aria-hidden="true" />
      {{ open ? 'Hide activity' : `Show all activity · ${items.length}` }}
    </button>
    <ul v-if="open" class="mt-2 space-y-1.5 border-l border-outline-gray-2 pl-3">
      <li v-for="(a, i) in list" :key="i" class="text-p-sm text-ink-gray-7">
        <span class="text-ink-gray-8">{{ personName(a.actor) }}</span> {{ a.text }}
        <span class="text-ink-gray-5">· {{ relTime(a.at) }}</span>
      </li>
    </ul>
  </section>
</template>
