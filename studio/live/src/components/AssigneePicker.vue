<script setup lang="ts">
import { computed } from 'vue'
import { Combobox, toast } from 'frappe-ui'
import { state, project, personName, reassign, wsPeople } from '../lib/store'
import { membersOf } from '../lib/files'

// Pick who does the task. Anyone in the workspace; project members first. One assignee.
const props = defineProps<{ task: any; disabled?: boolean }>()
const t = computed(() => props.task)

const options = computed(() => {
  const ids = membersOf(t.value.space, wsPeople.value, project)
  const inProject = (id: string) => t.value.space === 'general' || !!project(t.value.space)?.members.some((m: any) => m.user === id)
  const list = ids
    .sort((a: string, b: string) => (a === state.me ? -1 : b === state.me ? 1 : Number(inProject(b)) - Number(inProject(a)) || personName(a).localeCompare(personName(b))))
    .map((id: string) => ({
      label: id === state.me ? `${personName(id)} (you)` : personName(id),
      value: id,
      description: inProject(id) ? undefined : 'Not in this project yet',
    }))
  if (t.value.space !== 'general') list.push({ label: 'Unassigned', value: '__none' })
  return list
})

const value = computed({
  get: () => t.value.assignee || '__none',
  set: (v: string | null) => {
    const to = !v || v === '__none' ? null : v
    if (to === t.value.assignee) return
    reassign(t.value.id, to)
    toast.success(to ? `Assigned to ${personName(to)}.` : 'Assignee removed.')
  },
})
</script>

<template>
  <Combobox
    v-model="value"
    :options="options"
    trigger="button"
    placeholder="Assign"
    :disabled="disabled"
    aria-label="Assignee"
  />
</template>
