<script setup lang="ts">
import { computed } from 'vue'
import { Button, Dropdown } from 'frappe-ui'

// The view switch, one button like Frappe CRM's "List View ⇅": the current view's icon and name, a menu of the others.
// It sits at the far right of the list toolbar (decided, Round 238). My tasks: List · Kanban. A project (Classic layout): Milestones · List ·
// Kanban · Timeline. The Projects page passes its own (Folders · List). Remembered per screen while the session lasts.
// (Decided, Round 237: replaces the segmented List | Board and the "View switch" variants.)
const props = withDefaults(
  defineProps<{ project?: boolean; noTimeline?: boolean; options?: { label: string; value: string; icon: string }[] }>(),
  { project: false, noTimeline: false },
)
const view = defineModel<string>({ default: 'list' })
const opts = computed(() => {
  if (props.options) return props.options
  const list = { label: 'List', value: 'list', icon: 'lucide-list' }
  const kanban = { label: 'Kanban', value: 'board', icon: 'lucide-square-kanban' }
  return props.project
    ? [
        { label: 'Milestones', value: 'milestones', icon: 'lucide-flag-triangle-right' },
        list,
        kanban,
        ...(props.noTimeline ? [] : [{ label: 'Timeline', value: 'timeline', icon: 'lucide-gantt-chart' }]),
      ]
    : [list, kanban]
})
const current = computed(() => opts.value.find((o) => o.value === view.value) || opts.value[0])
const menu = computed(() => opts.value.map((o) => ({ label: `${o.label} view`, icon: o.icon, selected: o.value === view.value, onClick: () => (view.value = o.value) })))
</script>

<template>
  <Dropdown :options="menu">
    <Button variant="subtle" class="shrink-0" :icon-left="current.icon" icon-right="lucide-chevrons-up-down" :label="`${current.label} view`" :aria-label="`View: ${current.label}. Change`" />
  </Dropdown>
</template>
