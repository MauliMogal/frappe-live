<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, FormControl, DatePicker, Button, Avatar, toast } from 'frappe-ui'
import PrioritySelect from './PrioritySelect.vue'
import { state, createProject, personName, wsPeople, org, inScope, inviteToProject, inPersonal } from '../lib/store'
import { PRIORITY, PRIORITY_ORDER } from '../lib/meta'

// Create project. Only the name is required; everything else is shown so it gets filled in,
// but nothing is decided for you (no default priority, no start date of "today").
//   Name* · Description · Start date · Target date · Priority · People
// No short code: there are no task IDs anywhere, so the code is made quietly from the name.
const router = useRouter()
const open = computed({
  get: () => state.ui.createProject,
  set: (v) => (state.ui.createProject = v),
})
const blank = () => ({ name: '', description: '', start: '', target: '', priority: '', people: [] as string[] })
const f = ref(blank())
// Fresh form, cursor in Name (so typing right away isn't lost)
const formBox = ref<HTMLElement | null>(null)
watch(open, (v) => {
  if (!v) return
  f.value = blank()
  setTimeout(() => formBox.value?.querySelector('input')?.focus(), 50)
})

// Everyone else in the workspace who has joined
const others = computed(() => wsPeople.value.filter((p) => p.id !== state.me && p.onboarded))
const toggle = (id: string) => {
  const i = f.value.people.indexOf(id)
  i >= 0 ? f.value.people.splice(i, 1) : f.value.people.push(id)
}

const nameTaken = computed(() => state.projects.some((p) => inScope(p) && p.name.toLowerCase() === f.value.name.trim().toLowerCase()))
const datesWrong = computed(() => !!f.value.start && !!f.value.target && f.value.target < f.value.start)
const valid = computed(() => !!f.value.name.trim() && !nameTaken.value && !datesWrong.value)

// A short internal code from the name, unique (never shown).
function makeCode(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const base = (words.length > 1 ? words.map((w) => w[0]).join('') : name.trim().slice(0, 3)).toUpperCase().slice(0, 4) || 'P'
  let code = base
  let n = 2
  while (state.projects.some((p) => p.code === code)) code = `${base}${n++}`
  return code
}

function create() {
  if (!valid.value) return
  const p = createProject({
    name: f.value.name,
    code: makeCode(f.value.name),
    description: f.value.description,
    start: f.value.start || null,
    target: f.value.target || null,
    priority: f.value.priority || null,
    // Workspaces on: picked people get an invite (they join when they accept)
    people: org.on ? [] : [...f.value.people],
  })
  if (org.on) f.value.people.forEach((u) => inviteToProject(p.id, u))
  open.value = false
  router.push(`/p/${p.id}`)
  toast.success(`${p.name} created. Start with a milestone.`)
}
</script>

<template>
  <Dialog v-model:open="open" title="Create project" size="lg">
    <template #default>
      <form ref="formBox" class="space-y-4" @submit.prevent="create">
        <FormControl v-model="f.name" label="Name" placeholder="Helpdesk redesign" aria-required="true" :error="nameTaken ? 'A project with this name already exists.' : undefined" />
        <FormControl v-model="f.description" type="textarea" label="Description" placeholder="What is this project for?" />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DatePicker v-model="f.start" label="Start date" placeholder="Pick a date" />
          <DatePicker v-model="f.target" label="Target date" placeholder="Pick a date" />
          <PrioritySelect v-model="f.priority" />
        </div>
        <p v-if="datesWrong" class="-mt-2 text-p-sm text-ink-red-5">The target date is before the start date.</p>

        <!-- People: tap to add them as Members. Picked = outline + tick (never black: Create project is the one primary) -->
        <div v-if="others.length" class="space-y-1.5">
          <p class="text-xs text-ink-gray-5">People</p>
          <div class="flex flex-wrap gap-1.5">
            <Button
              v-for="u in others"
              :key="u.id"
              size="sm"
              :variant="f.people.includes(u.id) ? 'outline' : 'subtle'"
              :aria-pressed="f.people.includes(u.id)"
              @click="toggle(u.id)"
            >
              <template #prefix><Avatar size="xs" :label="personName(u.id)" /></template>
              {{ personName(u.id) }}
              <template #suffix><span v-if="f.people.includes(u.id)" class="lucide-check size-3.5 text-ink-gray-7" aria-hidden="true" /></template>
            </Button>
          </div>
        </div>

        <p class="text-p-sm text-ink-gray-5">
          <template v-if="inPersonal">Only you can see it. To work on it with others later, move it to a company workspace.</template>
          <template v-else-if="org.on">You'll be the Lead<template v-if="f.people.length">; {{ f.people.map(personName).join(', ') }} get an invite</template>. Only people you invite can see it.</template>
          <template v-else>You'll be the Lead<template v-if="f.people.length">; {{ f.people.map(personName).join(', ') }} join as Members</template>. Everyone can see it and join.</template>
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Create project" type="submit" :disabled="!valid" />
        </div>
      </form>
    </template>
  </Dialog>
</template>
