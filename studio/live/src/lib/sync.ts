import { reactive, watch } from 'vue'
import { toast } from 'frappe-ui'
import { state, workspaces, currentWsOf, seedReminders } from './store'
import { notesState } from './notes'
import { pins } from './pins'

// Keeps the store (lib/store.ts) in step with the server (tasks/api.py).
//  · Load: the app's boot data (studio_app_boot hook), or the get_boot API when there is none (Studio canvas).
//    The very first load ever sends the prototype's seed data, so the site starts where the prototype did.
//  · Save: every change, a moment later. Only records and map keys that changed are sent.
//  · Live: changes other people save arrive over the socket (live_sync) and are merged in.

type Collection = { get: () => any[]; set: (rows: any[]) => void; key: string }
const COLLECTIONS: Record<string, Collection> = {
  people: { get: () => state.people, set: (r) => (state.people = r), key: 'id' },
  projects: { get: () => state.projects, set: (r) => (state.projects = r), key: 'id' },
  invites: { get: () => state.invites, set: (r) => (state.invites = r), key: 'token' },
  tasks: { get: () => state.tasks, set: (r) => (state.tasks = r), key: 'id' },
  notifications: { get: () => state.notifications, set: (r) => (state.notifications = r), key: 'id' },
  workspaces: { get: () => workspaces, set: (r) => workspaces.splice(0, workspaces.length, ...r), key: 'id' },
  notes: { get: () => notesState.notes, set: (r) => (notesState.notes = r), key: 'id' },
}
const MAPS: Record<string, () => Record<string, any>> = {
  settings: () => state.settings,
  hints: () => state.hints,
  seen: () => state.seen,
  onboarding: () => state.onboarding,
  pins: () => pins,
  currentWsOf: () => currentWsOf,
  workspace: () => state.workspace,
}

// routed: the first-visit redirect (welcome, invite) already ran for this load
export const sync = reactive({ ready: false, error: '' as string, saving: false, routed: false })

const CLIENT = Math.random().toString(36).slice(2)
// What the server has, as JSON per record / map key. A change is anything that differs from this.
const saved: Record<string, Map<string, string>> = {}
const json = (x: any) => JSON.stringify(x ?? null)
const keyOf = (kind: string, r: any) => String(r?.[COLLECTIONS[kind].key] ?? '')

function snapshotAll() {
  for (const [kind, c] of Object.entries(COLLECTIONS)) saved[kind] = new Map(c.get().map((r) => [keyOf(kind, r), json(r)]))
  for (const [name, get] of Object.entries(MAPS)) saved[`map:${name}`] = new Map(Object.entries(get()).map(([k, v]) => [k, json(v)]))
}

function replaceMap(target: Record<string, any>, values: Record<string, any>) {
  Object.keys(target).forEach((k) => delete target[k])
  Object.assign(target, values)
}

// Everything in the store now, in the shape the server stores (used once, to seed)
function everything() {
  const records: any = {}
  for (const [kind, c] of Object.entries(COLLECTIONS)) records[kind] = { upserts: JSON.parse(json(c.get())) }
  const maps: any = {}
  for (const [name, get] of Object.entries(MAPS)) maps[name] = JSON.parse(json(get()))
  return { records, maps }
}

function applyBoot(boot: any) {
  for (const [kind, c] of Object.entries(COLLECTIONS)) c.set(boot.records?.[kind] || [])
  for (const [name, get] of Object.entries(MAPS)) replaceMap(get(), boot.maps?.[name] || {})
  state.me = boot.me
  state.signedIn = true
  snapshotAll()
  // Today's reminders (due tomorrow, today, overdue; milestones close) are added on every load, then saved
  seedReminders()
}

async function post(method: string, args: Record<string, any>, keepalive = false) {
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?._server_messages ? JSON.parse(JSON.parse(data._server_messages)[0]).message : data?.exception || res.statusText)
  return data.message
}

let loading: Promise<void> | null = null
export function loadData() {
  if (loading) return loading
  loading = (async () => {
    try {
      let boot: any = (window as any).boot
      if (!boot || boot.seeded === undefined) boot = await post('frappe_live.api.get_boot', {})
      // First load ever: the site gets the prototype's seed data (what the store starts with)
      if (boot && boot.seeded === false) boot = await post('frappe_live.api.seed', { payload: json(everything()) })
      if (!boot?.me) throw new Error('Could not load your tasks. Are you signed in?')
      applyBoot(boot)
      startSaving()
      sync.ready = true
    } catch (e: any) {
      sync.error = e?.message || String(e)
      loading = null
    }
  })()
  return loading
}

// ── Saving ────────────────────────────────────────────────────────────────────

function changes() {
  const records: any = {}
  const maps: any = {}
  let any = false
  for (const [kind, c] of Object.entries(COLLECTIONS)) {
    const before = saved[kind]
    const now = new Map(c.get().map((r) => [keyOf(kind, r), json(r)]))
    const upserts = [...now].filter(([k, v]) => k && before.get(k) !== v).map(([, v]) => JSON.parse(v))
    const deletes = [...before.keys()].filter((k) => !now.has(k))
    if (upserts.length || deletes.length) {
      records[kind] = { upserts, deletes }
      any = true
    }
    saved[kind] = now
  }
  for (const [name, get] of Object.entries(MAPS)) {
    const before = saved[`map:${name}`]
    const now = new Map(Object.entries(get()).map(([k, v]) => [k, json(v)]))
    const diff: any = {}
    for (const [k, v] of now) if (before.get(k) !== v) diff[k] = JSON.parse(v)
    for (const k of before.keys()) if (!now.has(k)) diff[k] = null
    if (Object.keys(diff).length) {
      maps[name] = diff
      any = true
    }
    saved[`map:${name}`] = now
  }
  return any ? { records, maps } : null
}

let timer: any = null
async function flush(keepalive = false) {
  clearTimeout(timer)
  timer = null
  const payload = changes()
  if (!payload) return
  sync.saving = true
  try {
    await post('frappe_live.api.save', { payload: json(payload), client: CLIENT }, keepalive)
  } catch (e: any) {
    toast.error('Could not save your changes', { description: e?.message })
  } finally {
    sync.saving = false
  }
}
const schedule = () => {
  clearTimeout(timer)
  timer = setTimeout(flush, 400)
}

let saving = false
function startSaving() {
  if (saving) return
  saving = true
  for (const c of Object.values(COLLECTIONS)) watch(c.get, schedule, { deep: true })
  for (const get of Object.values(MAPS)) watch(get, schedule, { deep: true })
  // Leaving the page: send what's left
  window.addEventListener('pagehide', () => timer && flush(true))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && timer && flush(true))
  schedule()
}

// ── Live changes from other people ─────────────────────────────────────────────

function merge(msg: any) {
  if (!msg || msg.client === CLIENT || !sync.ready) return
  for (const [kind, change] of Object.entries<any>(msg.records || {})) {
    const c = COLLECTIONS[kind]
    if (!c) continue
    const rows = c.get()
    for (const rec of change.upserts || []) {
      const k = keyOf(kind, rec)
      saved[kind].set(k, json(rec))
      const i = rows.findIndex((r) => keyOf(kind, r) === k)
      if (i >= 0) rows.splice(i, 1, rec)
      else rows.push(rec)
    }
    for (const k of change.deletes || []) {
      saved[kind].delete(String(k))
      const i = rows.findIndex((r) => keyOf(kind, r) === String(k))
      if (i >= 0) rows.splice(i, 1)
    }
  }
  for (const [name, diff] of Object.entries<any>(msg.maps || {})) {
    const get = MAPS[name]
    if (!get) continue
    const target = get()
    for (const [k, v] of Object.entries(diff)) {
      if (v === null) {
        saved[`map:${name}`].delete(k)
        delete target[k]
      } else {
        saved[`map:${name}`].set(k, json(v))
        target[k] = v
      }
    }
  }
}

let listening = false
export function listen(socket: any) {
  if (listening || !socket?.on) return
  listening = true
  socket.on('live_sync', merge)
}
