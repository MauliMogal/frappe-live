<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, FormControl, Button, toast } from 'frappe-ui'
import { state, workspaces, createWorkspace } from '../lib/store'

// Create workspace (Workspaces on). Just a name: you're its Admin, then invite people from Settings → Workspace.
const router = useRouter()
const open = computed({ get: () => !!state.ui.createWorkspace, set: (v) => (state.ui.createWorkspace = v) })
const name = ref('')
const box = ref<HTMLElement | null>(null)
watch(open, (v) => {
  if (!v) return
  name.value = ''
  setTimeout(() => box.value?.querySelector('input')?.focus(), 50)
})
const taken = computed(() => workspaces.some((w) => w.name.toLowerCase() === name.value.trim().toLowerCase()))
function create() {
  if (!name.value.trim() || taken.value) return
  createWorkspace(name.value)
  open.value = false
  router.push('/projects')
  toast.success(`${name.value.trim()} created. Invite people from Settings → Workspace.`)
}
</script>

<template>
  <Dialog v-model:open="open" title="Create workspace" size="sm">
    <template #default>
      <form ref="box" class="space-y-4" @submit.prevent="create">
        <FormControl v-model="name" label="Name" placeholder="Your team or company" aria-required="true" :error="taken ? 'A workspace with this name already exists.' : undefined" />
        <p class="text-p-sm text-ink-gray-5">You'll be its Admin. Projects and people stay inside it. My tasks there shows your tasks from its projects. Notes stay yours.</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" @click="open = false" />
          <Button variant="solid" theme="gray" label="Create workspace" type="submit" :disabled="!name.trim() || taken" />
        </div>
      </form>
    </template>
  </Dialog>
</template>
