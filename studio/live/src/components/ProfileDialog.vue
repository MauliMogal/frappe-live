<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, FormControl, Button, Avatar, toast } from 'frappe-ui'
import { state, me, signOut } from '../lib/store'

// Profile: its own window, from the profile item at the bottom of the sidebar (phones: the avatar menu).
// Name, role, email (from the Frappe account), time zone. Log out lives here (it's about you, not a setting).
const open = computed({ get: () => !!state.ui.profile, set: (v: boolean) => (state.ui.profile = v) })
const router = useRouter()
const profile = ref({ name: '', role: '', timezone: 'Asia/Kolkata' })
watch(open, (v) => {
  if (v) profile.value = { name: me.value.name, role: me.value.role, timezone: me.value.timezone || 'Asia/Kolkata' }
})
const changed = computed(
  () => profile.value.name !== me.value.name || profile.value.role !== me.value.role || profile.value.timezone !== (me.value.timezone || 'Asia/Kolkata'),
)
const TIMEZONES = [
  { label: 'India (IST)', value: 'Asia/Kolkata' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London', value: 'Europe/London' },
  { label: 'New York', value: 'America/New_York' },
]
function save() {
  if (!profile.value.name.trim()) return
  Object.assign(me.value, { name: profile.value.name.trim(), role: profile.value.role.trim(), timezone: profile.value.timezone })
  toast.success('Profile saved.')
  open.value = false
}
function logOut() {
  open.value = false
  signOut()
  router.push('/login')
}
</script>

<template>
  <Dialog v-model:open="open" title="Profile" size="md">
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <Avatar :label="profile.name || me.name" size="2xl" />
        <div class="min-w-0">
          <p class="truncate text-base-medium text-ink-gray-9">{{ me.name }}</p>
          <p class="truncate text-p-sm text-ink-gray-5">{{ me.email }}</p>
        </div>
      </div>
      <FormControl v-model="profile.name" label="Name" aria-required="true" :error="!profile.name.trim() ? 'Enter your name.' : undefined" />
      <FormControl v-model="profile.role" label="Role" placeholder="Design intern" />
      <FormControl v-model="profile.timezone" type="select" label="Time zone" :options="TIMEZONES" description="Due dates follow this." />
      <p class="text-p-xs text-ink-gray-5">Your photo and email come from your Frappe account.</p>
      <div class="flex items-center gap-2 border-t border-outline-gray-1 pt-4">
        <Button variant="ghost" theme="red" icon-left="lucide-log-out" label="Log out" @click="logOut" />
        <Button class="ml-auto" variant="ghost" label="Cancel" @click="open = false" />
        <Button variant="solid" theme="gray" label="Save" :disabled="!changed || !profile.name.trim()" @click="save" />
      </div>
    </div>
  </Dialog>
</template>
