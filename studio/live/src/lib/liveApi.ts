import { ref } from 'vue'

// Calls to the Frappe Live server for the Reports and Messages views (frappe_live/views.py, portal.py).
// GET for reads, POST for writes, both with the session's CSRF token.

function errorOf(data: any, fallback: string) {
  try {
    if (data?._server_messages) return JSON.parse(JSON.parse(data._server_messages)[0]).message
  } catch {}
  return data?.exception || fallback
}

export async function liveGet(method: string, args: Record<string, any> = {}) {
  const qs = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  const res = await fetch(`/api/method/${method}?${qs}`, { headers: { Accept: 'application/json' } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorOf(data, res.statusText))
  return data.message
}

export async function livePost(method: string, args: Record<string, any> = {}) {
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorOf(data, res.statusText))
  return data.message
}

export const STAGES = ['Yet to start', 'Set up', 'Start using', 'Habit', 'Live at day 30', 'Live at day 90', 'Paused', 'Churned']

// One colour per stage (Tailwind classes from Frappe UI's palette, fine in light and dark)
export const STAGE_BG: Record<string, string> = {
  'Yet to start': 'bg-surface-gray-4',
  'Set up': 'bg-surface-blue-3',
  'Start using': 'bg-surface-blue-5',
  Habit: 'bg-surface-violet-5',
  'Live at day 30': 'bg-surface-green-4',
  'Live at day 90': 'bg-surface-green-6',
  Paused: 'bg-surface-amber-4',
  Churned: 'bg-surface-red-5',
}

export const HEALTH_DOT: Record<string, string> = {
  'On track': 'bg-surface-green-5',
  'At risk': 'bg-surface-amber-5',
  'Off track': 'bg-surface-red-5',
}

export function money(n: number | null | undefined) {
  const v = Number(n || 0)
  return v ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$0'
}

export function ago(iso: string) {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T'))
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Conversations waiting for a team reply (the sidebar's Messages count). Refreshed when the app loads and every few minutes.
export const liveWaiting = ref(0)
let polling = false
export function watchWaiting() {
  if (polling) return
  polling = true
  const tick = () => liveGet('frappe_live.views.waiting').then((n) => (liveWaiting.value = n || 0)).catch(() => {})
  tick()
  setInterval(tick, 3 * 60 * 1000)
}
