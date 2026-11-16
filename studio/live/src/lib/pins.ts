import { reactive, computed } from 'vue'
import { state, project, isMember, inScope } from './store'

// Pinned projects: the only projects in the sidebar. You can pin only projects you're part of.
// Only you pin or unpin: joining or creating a project never pins it. Everything else lives in All projects.
export const pins = reactive<Record<string, string[]>>({
  // portfolio only shows with Workspaces on (Swarali's personal workspace)
  swarali: ['gameplan', 'crm', 'portfolio'],
  neha: ['gameplan', 'crm', 'erpnext'],
  rohan: ['helpdesk'],
  admin: [],
  newbie: [],
})
export const pinnedIds = computed(() => pins[state.me] || [])
export const pinnedProjects = computed(() =>
  pinnedIds.value.map((id) => project(id)).filter((p: any) => p && p.status !== 'archived' && isMember(p.id) && inScope(p)),
)
export const canPin = (pid: string) => isMember(pid)
export const isPinned = (pid: string) => isMember(pid) && pinnedIds.value.includes(pid)
export function setPinned(pid: string, on: boolean) {
  if (on && !isMember(pid)) return
  const list = pins[state.me] || (pins[state.me] = [])
  const i = list.indexOf(pid)
  if (on && i < 0) list.push(pid)
  if (!on && i >= 0) list.splice(i, 1)
}
export const togglePin = (pid: string) => setPinned(pid, !isPinned(pid))
