<script setup lang="ts">
import { ref, computed } from 'vue'
import { Avatar, Popover } from 'frappe-ui'
import { state, personName, person } from '../lib/store'

// Overlapping avatars. Click them: a small card under the avatars lists everyone
// (name, job, Owner tag; no search: the list scrolls).
// owners: people to tag as Owner (project leads). Clicks never reach the card or row underneath.
const props = withDefaults(
  defineProps<{ people: string[]; max?: number; size?: 'xs' | 'sm'; ring?: string; title?: string; owners?: string[] }>(),
  { max: 3, size: 'sm', ring: 'ring-surface-base', title: 'People', owners: () => [] },
)
const open = ref(false)
const more = computed(() => Math.max(0, props.people.length - props.max))
const nameOf = (u: string) => (u === state.me ? `${personName(u)} (you)` : personName(u))
// Owners first, then you, then everyone else by name
const sorted = computed(() =>
  [...props.people].sort(
    (a, b) =>
      Number(props.owners.includes(b)) - Number(props.owners.includes(a)) ||
      Number(b === state.me) - Number(a === state.me) ||
      personName(a).localeCompare(personName(b)),
  ),
)
</script>

<template>
  <span v-if="people.length" class="inline-flex" @click.stop @keydown.enter.stop>
    <Popover v-model:open="open" trigger="manual" side="bottom" align="start" :offset="6">
      <template #trigger>
        <button type="button" class="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4" :aria-label="`${title}: ${people.length} people`" :aria-expanded="open" @click="open = !open">
          <span class="flex -space-x-1.5">
            <Avatar v-for="u in people.slice(0, max)" :key="u" :size="size" :label="personName(u)" class="ring-2" :class="ring" />
            <span v-if="more" class="z-10 flex items-center justify-center rounded-full bg-surface-gray-3 text-2xs tabular-nums text-ink-gray-7 ring-2" :class="[ring, size === 'xs' ? 'size-4' : 'size-6']">+{{ more }}</span>
          </span>
        </button>
      </template>
      <template #default>
        <!-- Same card as the header's People pop-up (PeoplePopover.vue) -->
        <div class="w-72 rounded-5 bg-surface-modal p-1.5 shadow-xl ring-1 ring-outline-gray-1" role="dialog" :aria-label="title" @click.stop>
          <p class="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-sm-medium text-ink-gray-9">
            {{ title }}<span class="text-sm tabular-nums text-ink-gray-5">{{ people.length }}</span>
          </p>
          <ul class="max-h-64 overflow-y-auto">
            <li v-for="u in sorted" :key="u" class="flex items-center gap-2.5 rounded-4 px-2 py-1.5 hover:bg-surface-gray-2">
              <Avatar size="sm" :label="personName(u)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink-gray-9">{{ nameOf(u) }}</span>
                <span v-if="person(u)?.role" class="block truncate text-xs text-ink-gray-5">{{ person(u).role }}</span>
              </span>
              <span v-if="owners.includes(u)" class="shrink-0 text-xs text-ink-gray-5">Lead</span>
            </li>
          </ul>
        </div>
      </template>
    </Popover>
  </span>
</template>
