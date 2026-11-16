<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Avatar, Button, Dropdown, TextInput, toast } from 'frappe-ui'
import { state, person, personName } from '../lib/store'
import { currentWs, isWsAdmin, wsAdmins, setWsRole, removeFromWs, inviteToWs, resendWsInvite, cancelWsInvite, myWorkspaces, switchWorkspace } from '../lib/store'
import { relTime } from '../lib/dates'

// Settings → Workspace (Workspaces on). Everyone sees who's in. Admins also rename it, invite by email,
// set Admin / Member, remove people and manage invites. Anyone can leave (except the last Admin).
const w = computed(() => currentWs.value)
const admin = computed(() => isWsAdmin())
const lastAdmin = (u: string) => wsAdmins(w.value?.id || null).length === 1 && wsAdmins(w.value?.id || null)[0] === u

const name = ref('')
watch(w, (v) => (name.value = v?.name || ''), { immediate: true })
function saveName() {
  if (!w.value || !name.value.trim()) return
  w.value.name = name.value.trim()
  toast.success('Workspace renamed.')
}

const email = ref('')
const isEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
function invite() {
  if (!isEmail.value) return
  const e = email.value.trim()
  const r = inviteToWs(e)
  toast.success(r === 'member' ? `${e} is already in ${w.value!.name}.` : r === 'resent' ? `Invite sent again to ${e}.` : `Invite sent to ${e}.`)
  email.value = ''
}
const invites = computed(() => (w.value?.invites || []).filter((i: any) => ['pending', 'expired'].includes(i.status)))

function roleMenu(m: any) {
  const last = lastAdmin(m.user)
  return [
    { label: 'Admin', selected: m.role === 'Admin', onClick: () => setWsRole(w.value!.id, m.user, 'Admin') },
    { label: 'Member', selected: m.role === 'Member', disabled: last, description: last ? 'A workspace needs an Admin' : undefined, onClick: () => setWsRole(w.value!.id, m.user, 'Member') },
    { label: 'Remove from workspace', icon: 'lucide-user-minus', theme: 'red', disabled: last || m.user === state.me, onClick: () => remove(m) },
  ]
}
function remove(m: any) {
  removeFromWs(w.value!.id, m.user)
  toast.success(`${personName(m.user)} removed from ${w.value!.name} and its projects. Their open tasks are now unassigned.`)
}
function leave() {
  const n = w.value!.name
  removeFromWs(w.value!.id, state.me)
  const next = myWorkspaces.value[0]
  if (next) switchWorkspace(next.id, true)
  state.ui.settings = false
  toast.success(`You left ${n}.`)
}
</script>

<template>
  <div v-if="w" class="space-y-6 pt-2">
    <!-- Name -->
    <section>
      <p class="text-base-medium text-ink-gray-9">Name</p>
      <div v-if="admin" class="mt-2 flex gap-2">
        <TextInput v-model="name" class="flex-1" aria-label="Workspace name" @keydown.enter="saveName" />
        <Button variant="subtle" label="Save" :disabled="!name.trim() || name.trim() === w.name" @click="saveName" />
      </div>
      <p v-else class="mt-1 text-p-sm text-ink-gray-7">{{ w.name }} <span class="text-ink-gray-5">· Only admins can rename it.</span></p>
    </section>

    <!-- Invite (admins) -->
    <section v-if="admin">
      <p class="text-base-medium text-ink-gray-9">Invite people</p>
      <p class="mt-0.5 text-p-sm text-ink-gray-5">They join {{ w.name }} as Members. Project leads add them to projects.</p>
      <div class="mt-2 flex gap-2">
        <TextInput v-model="email" class="flex-1" type="email" placeholder="Enter an email address" aria-label="Email to invite" @keydown.enter="invite" />
        <Button variant="subtle" label="Invite" :disabled="!isEmail" @click="invite" />
      </div>
    </section>

    <!-- Members -->
    <section>
      <p class="text-base-medium text-ink-gray-9">Members <span class="text-sm tabular-nums text-ink-gray-5">{{ w.members.length }}</span></p>
      <ul class="mt-1 divide-y divide-outline-gray-1">
        <li v-for="m in w.members" :key="m.user" class="flex items-center gap-2.5 py-2">
          <Avatar size="sm" :label="personName(m.user)" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-ink-gray-9">{{ personName(m.user) }}<span v-if="m.user === state.me" class="text-ink-gray-5"> (you)</span></span>
            <span class="block truncate text-xs text-ink-gray-5">{{ person(m.user)?.email }}</span>
          </span>
          <Dropdown v-if="admin" :options="roleMenu(m)" align="end">
            <Button size="sm" variant="ghost" :label="m.role" icon-right="lucide-chevron-down" />
          </Dropdown>
          <span v-else class="shrink-0 text-xs text-ink-gray-5">{{ m.role }}</span>
        </li>
      </ul>
    </section>

    <!-- Invites (admins) -->
    <section v-if="admin && invites.length">
      <p class="text-base-medium text-ink-gray-9">Invites</p>
      <ul class="mt-1 divide-y divide-outline-gray-1">
        <li v-for="i in invites" :key="i.id" class="flex items-center gap-2.5 py-2">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-2" aria-hidden="true"><span class="lucide-mail size-3.5 text-ink-gray-5" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-ink-gray-8">{{ i.email }}</span>
            <span class="block truncate text-xs" :class="i.status === 'expired' ? 'text-ink-red-5' : 'text-ink-gray-5'">
              {{ i.status === 'expired' ? 'Expired' : 'Waiting' }} · invited by {{ personName(i.by) }} {{ relTime(i.at) }}
            </span>
          </span>
          <Button size="sm" variant="ghost" :label="i.status === 'expired' ? 'Send again' : 'Resend'" @click="resendWsInvite(w.id, i.id); toast.success(`Invite sent again to ${i.email}.`)" />
          <Button size="sm" variant="ghost" label="Cancel" @click="cancelWsInvite(w.id, i.id); toast.success('Invite cancelled.')" />
        </li>
      </ul>
    </section>

    <!-- Leave -->
    <section class="border-t border-outline-gray-1 pt-4">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1">
          <span class="block text-base-medium text-ink-gray-9">Leave {{ w.name }}</span>
          <span class="mt-0.5 block text-p-sm text-ink-gray-5">
            {{ lastAdmin(state.me) ? 'You are the only Admin. Make someone else Admin first.' : 'You leave its projects too. Your open tasks there become unassigned. Your personal tasks stay in Personal.' }}
          </span>
        </span>
        <Button variant="ghost" theme="red" label="Leave" :disabled="lastAdmin(state.me)" @click="leave" />
      </div>
    </section>
  </div>
</template>
