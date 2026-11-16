import { design } from './look'
import { spaceName, wsById, myPersonalWs } from './store'

// Where a task lives, as lists show it in their Project column. Your own tasks (no project) aren't in a project, so
// they never get the folder. Variants → "Own tasks in lists": icon (the My tasks check, as in the sidebar) | blank
export function placeCell(t: any) {
  if (t.space !== 'general') return { icon: 'lucide-folder', text: spaceName(t.space), color: 'var(--ink-gray-7)' }
  if (design.ownPlace === 'blank') return { icon: '', text: '', color: '' }
  return { icon: 'lucide-circle-check-big', text: 'My tasks', color: 'var(--ink-gray-5)' }
}

// The workspace whose My tasks an own task is in (Personal, or a company's own My tasks)
export const ownWsName = (t: any) => wsById(t?.ws || null)?.name || myPersonalWs.value?.name || 'Personal'
