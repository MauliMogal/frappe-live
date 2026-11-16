<script setup lang="ts">
import { ref, computed } from 'vue'
import { Avatar, Popover } from 'frappe-ui'
import { state, personName, person } from '../lib/store'

// Pick people (e.g. a milestone's "Assigned to"). The same card as the People pop-ups (PeopleStack, PeoplePopover):
// w-72 · p-1.5 · title + count · avatar, name (you), job (no search). Picked people get a tick.
// Click a row to add or remove them; the card stays open so you can pick several.
const props = withDefaults(defineProps<{ people: string[]; title?: string; align?: 'start' | 'end' }>(), { title: 'Assigned to', align: 'end' })
const picked = defineModel<string[]>({ default: () => [] })
const open = ref(false)
const nameOf = (u: string) => (u === state.me ? `${personName(u)} (you)` : personName(u))
// You first, then everyone by name (same order as the other cards, without Owners: everyone here is pickable)
const shown = computed(() => [...props.people].sort((a, b) => Number(b === state.me) - Number(a === state.me) || personName(a).localeCompare(personName(b))))
function toggle(u: string) {
  picked.value = picked.value.includes(u) ? picked.value.filter((x) => x !== u) : [...picked.value, u]
}
</script>

<template>
  <span class="inline-flex" @click.stop @keydown.enter.stop>
    <Popover v-model:open="open" trigger="manual" side="bottom" :align="align" :offset="6">
      <template #trigger>
        <span class="inline-flex" :aria-expanded="open" @click="open = !open"><slot /></span>
      </template>
      <template #default>
        <div class="w-72 rounded-5 bg-surface-modal p-1.5 shadow-xl ring-1 ring-outline-gray-1" role="dialog" :aria-label="title" @click.stop>
          <p class="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-sm-medium text-ink-gray-9">
            {{ title }}<span class="text-sm tabular-nums text-ink-gray-5">{{ picked.length }}</span>
          </p>
          <ul class="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true">
            <li v-for="u in shown" :key="u" role="option" :aria-selected="picked.includes(u)">
              <button type="button" class="flex w-full items-center gap-2.5 rounded-4 px-2 py-1.5 text-left hover:bg-surface-gray-2" @click="toggle(u)">
                <Avatar size="sm" :label="personName(u)" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-ink-gray-9">{{ nameOf(u) }}</span>
                  <span v-if="person(u)?.role" class="block truncate text-xs text-ink-gray-5">{{ person(u).role }}</span>
                </span>
                <span v-if="picked.includes(u)" class="lucide-check size-4 shrink-0 text-ink-gray-7" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
      </template>
    </Popover>
  </span>
</template>
