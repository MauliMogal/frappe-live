<script setup lang="ts">
import { ref } from 'vue'
import { Button } from 'frappe-ui'

// Subtasks planned before the task exists (New task panel). Same look as planning tasks in a milestone:
// one line per subtask (just its title, editable in place; no status or date), × on hover, and a plain add line below (no grey box). Type, Enter, repeat.
const items = defineModel<{ id: string; text: string; done: boolean; source: string }[]>({ default: () => [] })
const draft = ref('')
function add() {
  const v = draft.value.trim()
  if (!v) return
  items.value = [...items.value, { id: `c${Date.now()}`, text: v, done: false, source: 'manual' }]
  draft.value = ''
}
const remove = (id: string) => (items.value = items.value.filter((x) => x.id !== id))
// Edit in place: click the text and type. Emptied and left = removed (same as ×).
function rename(c: { id: string; text: string }, v: string) {
  items.value = items.value.map((x) => (x.id === c.id ? { ...x, text: v } : x))
}
function tidy(c: { id: string; text: string }) {
  if (!c.text.trim()) remove(c.id)
}
</script>

<template>
  <div>
    <ul v-if="items.length" class="mb-2 divide-y divide-outline-gray-1 border-y border-outline-gray-1">
      <li v-for="c in items" :key="c.id" class="group flex h-9 items-center gap-2 px-1">
        <span class="lucide-square size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
        <!-- Editable: a plain input that looks like text (grey only on hover / focus) -->
        <input
          :value="c.text"
          class="h-7 min-w-0 flex-1 truncate rounded-4 border-0 bg-transparent px-1 text-base text-ink-gray-9 hover:bg-surface-gray-2 focus:bg-surface-gray-2 focus:outline-none focus:ring-0"
          :aria-label="`Subtask: ${c.text}`"
          maxlength="200"
          @input="rename(c, $event.target.value)"
          @blur="tidy(c)"
          @keydown.enter.prevent="$event.target.blur()"
        />
        <Button variant="ghost" size="sm" icon="lucide-x" :aria-label="`Remove ${c.text}`" class="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" @click="remove(c.id)" />
      </li>
    </ul>
    <!-- Add line: plain, no grey box -->
    <form class="flex h-9 items-center gap-1 pl-1 pr-1" @submit.prevent="add">
      <span class="lucide-plus size-3.5 shrink-0 text-ink-gray-4" aria-hidden="true" />
      <input
        v-model="draft"
        class="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        aria-label="Add a subtask"
        placeholder="Add a subtask"
        maxlength="200"
      />
      <Button variant="ghost" size="sm" icon="lucide-check" aria-label="Add subtask" tooltip="Add (Enter)" type="submit" :disabled="!draft.trim()" />
    </form>
  </div>
</template>
