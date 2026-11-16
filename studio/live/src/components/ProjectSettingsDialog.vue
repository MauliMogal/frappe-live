<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, FormControl, DatePicker, Button, toast } from 'frappe-ui'
import PrioritySelect from './PrioritySelect.vue'
import { state, project, personName, editProject, archiveProject, deleteProject, projectStats } from '../lib/store'

// Edit name, description, dates. The Owner changes in Members. Archive. Delete sits in a Danger zone with a confirm.
const router = useRouter()
const currentId = ref<string | null>(null)
const open = ref(false)
watch(
  () => state.ui.editProject,
  (v) => {
    if (v) {
      currentId.value = v
      const p = project(v)!
      form.value = { name: p.name, description: p.description, start: p.start || '', target: p.target || '', priority: p.priority || '' }
      confirmDelete.value = false
      open.value = true
    }
  },
)
watch(open, (v) => {
  if (!v) state.ui.editProject = null
})
const p = computed(() => project(currentId.value))
const form = ref({ name: '', description: '', start: '', target: '', priority: '' })
// Priority is set here by the Owner (new projects start with none). Same dots as everywhere (PrioritySelect).
const confirmDelete = ref(false)
const valid = computed(() => form.value.name.trim().length > 0)

function save() {
  if (!valid.value) return
  editProject(p.value!.id, {
    name: form.value.name.trim(),
    description: form.value.description,
    start: form.value.start || null,
    target: form.value.target || null,
  })
  p.value!.priority = form.value.priority || null
  toast.success('Project saved.')
  open.value = false
}
function archive() {
  const id = p.value!.id
  archiveProject(id)
  open.value = false
  toast.success(`${p.value!.name} archived.`, { action: { label: 'Undo', onClick: () => archiveProject(id, false) } })
}
function remove() {
  const name = p.value!.name
  deleteProject(p.value!.id)
  open.value = false
  router.push('/')
  toast.success(`${name} deleted.`)
}
</script>

<template>
  <Dialog v-model:open="open" title="Edit project" size="lg">
    <template #default>
      <form v-if="p" class="space-y-4" @submit.prevent="save">
        <FormControl v-model="form.name" label="Name" aria-required="true" />
        <FormControl v-model="form.description" type="textarea" label="Description (optional)" />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DatePicker v-model="form.start" label="Start date" />
          <DatePicker v-model="form.target" label="Target date" />
          <PrioritySelect v-model="form.priority" />
        </div>
        <p class="text-p-sm text-ink-gray-5">To change the Lead, open Members.</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Save" type="submit" :disabled="!valid" />
        </div>

        <div class="space-y-3 border-t border-outline-gray-1 pt-4">
          <div class="flex flex-wrap items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-base-medium text-ink-gray-8">Archive project</p>
              <p class="text-p-sm text-ink-gray-5">Hides it from the sidebar. Tasks stay, read-only. Find it later in Settings → Archived projects.</p>
            </div>
            <Button variant="subtle" label="Archive" @click="archive" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-base-medium text-ink-gray-8">Delete project</p>
              <p class="text-p-sm text-ink-gray-5">
                Its {{ projectStats(p.id).total }} tasks go to Deleted tasks for 30 days. The project itself can't be restored.
              </p>
            </div>
            <Button v-if="!confirmDelete" variant="subtle" theme="red" label="Delete" @click="confirmDelete = true" />
          </div>
          <div v-if="confirmDelete" class="flex flex-wrap items-center justify-end gap-2 rounded-5 border border-outline-gray-2 p-3">
            <span class="mr-auto text-base text-ink-gray-8">Delete “{{ p.name }}”?</span>
            <Button variant="ghost" label="Cancel" @click="confirmDelete = false" />
            <Button variant="solid" theme="red" label="Delete project" @click="remove" />
          </div>
        </div>
      </form>
    </template>
  </Dialog>
</template>
