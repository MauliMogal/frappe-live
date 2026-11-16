import { reactive, computed } from 'vue'
import dayjs from 'dayjs'
import { state, addTask, currentWs, myPersonalWs } from './store'
import { hoursAgo, now } from './dates'

// Quick notes: private to their owner. For meetings and quick thoughts; any line can become a task.
// A note: { id, owner, ws, title, body (rich text HTML), createdAt, updatedAt, made: [{ line, task }] } (made = lines turned into tasks)
// One notebook (Round 246): all your notes show in every workspace, so you open Notes and write, without thinking
// where. ws is just a tag (Personal / Frappe): the list can show one, and Create tasks lists that workspace's places
// first. Tasks from any note can go to any of your workspaces. (No ws = Frappe, for the older seeds.)

// Seeds are written as plain lines: "- " lines become a bullet list, the rest paragraphs.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function linesToHtml(text: string) {
  let html = ''
  let list: string[] = []
  const flush = () => {
    if (list.length) html += `<ul>${list.map((l) => `<li><p>${esc(l)}</p></li>`).join('')}</ul>`
    list = []
  }
  text.split('\n').forEach((l) => {
    const m = l.match(/^[-*•]\s+(.*)/)
    if (m) return list.push(m[1])
    flush()
    if (l.trim()) html += `<p>${esc(l.trim())}</p>`
  })
  flush()
  return html
}
const seed: any[] = [
  // ── Personal notes (tagged Personal): life admin, your own portfolio, groceries. One also has a work task in it,
  //    to show a Personal note sending a task to Frappe. ──
  {
    id: 'nt-p1',
    owner: 'swarali',
    ws: 'me-swarali',
    title: 'This month',
    body: 'Renew my passport before the end of the month, it expires in March. Call the bank about the new card. Book a dentist appointment for next week. Ask Riya to return the camera before the trip. Also for work: send Neha the Discussions v2 flows by Friday.',
    createdAt: hoursAgo(0.5),
    updatedAt: hoursAgo(0.5),
    made: [] as any[],
  },
  {
    id: 'nt-p5',
    owner: 'swarali',
    ws: 'me-swarali',
    title: 'Task manager · testing plan',
    body: 'Week 4 is for testing. Write the test script by next Wednesday. Ask the support team who can spare 30 minutes. Record every session so I can share clips with Neha. Keep the sessions to 3 tasks: add a task, plan a milestone, turn a note into tasks.',
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    made: [] as any[],
  },
  {
    id: 'nt-p2',
    owner: 'swarali',
    ws: 'me-swarali',
    title: 'Portfolio site',
    body: 'The Helpdesk case study needs a clear before and after.\n- Write the intro for the Helpdesk case study\n- Pick three screens for the Gameplan case study\n- Buy the domain before the launch',
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(20),
    made: [] as any[],
  },
  {
    id: 'nt-p3',
    owner: 'swarali',
    ws: 'me-swarali',
    title: 'Groceries',
    body: '- Oats\n- Coffee beans\n- Spinach\n- Dish soap',
    createdAt: hoursAgo(24 * 3),
    updatedAt: hoursAgo(24 * 3),
    made: [] as any[],
  },
  {
    id: 'nt-p4',
    owner: 'neha',
    ws: 'me-neha',
    title: 'Weekend',
    body: '- Book the car service\n- Call mom\n- Finish the Atomic Habits book',
    createdAt: hoursAgo(28),
    updatedAt: hoursAgo(28),
    made: [] as any[],
  },
  // ── Work notes (tagged Frappe) ──
  // Brainstorms: long paragraphs, the kind "Suggest tasks" (AI) is for. Newest, so they open first.
  {
    id: 'nt-8',
    owner: 'swarali',
    title: 'Brainstorm · Notes page',
    body: 'I think the notes page should feel lighter than a doc, more like a scratchpad. We should test the AI suggestions with five people from the support team before the demo next week. Maybe ask Ananya to write the Gameplan empty-state copy by Sunday, she has the tone right. Also the selection toolbar sometimes covers the text, need to fix its position. Neha liked the grey banner on the overview.',
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    made: [] as any[],
  },
  {
    id: 'nt-9',
    owner: 'neha',
    title: 'Offsite planning',
    body: 'Venue options are still open and prices go up next month. Book the venue by Friday so we get the early price. Ask Priya to collect food preferences from everyone. We need to plan two short talks, one on Gameplan and one on CRM, before 30 Oct. The CRM Kanban beta needs a demo video before 30 Oct, Karan can record it. The last offsite ran long, so keep it to half a day.',
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    made: [] as any[],
  },
  {
    id: 'nt-1',
    owner: 'swarali',
    title: 'Design crit · Discussions empty state',
    body: 'Neha liked option B copy.\nRemove the illustration, keep the icon.\n- Update the Figma frame with option B\n- Ask Ananya to check the copy tone\n- Share the new version in #design by Thursday',
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    made: [] as any[],
  },
  {
    id: 'nt-2',
    owner: 'swarali',
    title: '1:1 with Neha',
    body: 'Going well. Focus on CRM for the next two weeks.\n- Pair with Priya on the Kanban card\n- Read the CRM roadmap doc',
    createdAt: hoursAgo(26),
    updatedAt: hoursAgo(26),
    made: [] as any[],
  },
  {
    id: 'nt-3',
    owner: 'swarali',
    title: 'Onboarding ideas',
    body: 'Starter tasks work better than a tour.\nMaybe a short video on My tasks?',
    createdAt: hoursAgo(24 * 6),
    updatedAt: hoursAgo(24 * 6),
    made: [] as any[],
  },
  {
    id: 'nt-4',
    owner: 'neha',
    title: 'Weekly design review',
    body: 'Gameplan is a week behind on Discussions v2.\nPriya has too much: move two tasks to Riya.\n- Move "Keyboard shortcuts" to Riya\n- Post a status update on Gameplan\n- Book a QA slot with Ishaan',
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    made: [] as any[],
  },
  {
    id: 'nt-5',
    owner: 'neha',
    title: 'CRM roadmap sync',
    body: 'Custom fields API is late (Karan).\nKanban beta moves to 2 Nov.\n- Tell sales about the new date',
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(30),
    made: [] as any[],
  },
  {
    id: 'nt-6',
    owner: 'neha',
    title: 'Intern feedback',
    body: 'Swarali: strong on layouts and quick to iterate. Push for more research.',
    createdAt: hoursAgo(24 * 9),
    updatedAt: hoursAgo(24 * 9),
    made: [] as any[],
  },
]

export const notesState = reactive({ notes: seed.map((n) => ({ ...n, body: linesToHtml(n.body), made: [] as any[] })) as any[] })

export const myNotes = computed(() => notesState.notes.filter((n) => n.owner === state.me).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
// The workspace a note is tagged with
export const noteWs = (n: any) => n?.ws || 'frappe'
export const note = (id: string | null | undefined) => notesState.notes.find((n) => n.id === id) || null

export function addNote() {
  const n = { id: `nt-${Date.now()}`, owner: state.me, ws: currentWs.value?.id || null, title: '', body: '', createdAt: now(), updatedAt: now(), made: [] as any[] }
  notesState.notes.unshift(n)
  return n
}
export function touchNote(id: string) {
  const n = note(id)
  if (n) n.updatedAt = now()
}
export function deleteNote(id: string) {
  notesState.notes = notesState.notes.filter((n) => n.id !== id)
}

// The note's text, block by block: list items (bullets, numbers, checklist) and the other lines.
function blocks(body: string) {
  const doc = new DOMParser().parseFromString(body || '', 'text/html')
  const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()
  const items = [...doc.querySelectorAll('li')].filter((li) => !li.querySelector('li')).map(text).filter(Boolean)
  const all = [...doc.querySelectorAll('p, h1, h2, h3, h4, blockquote, pre')]
    .filter((el) => !el.parentElement?.closest('p, h1, h2, h3, h4, blockquote, pre'))
    .map(text)
    .filter(Boolean)
  return { items, all }
}
// Plain lines of a note (for the list preview and search)
export const noteLines = (body: string) => blocks(body).all
// Lines a note can turn into tasks: the list items; if there are none, every line.
export function taskLines(body: string) {
  const { items, all } = blocks(body)
  return items.length ? items : all
}
// Make the chosen lines into tasks (your own, in General). Returns the new tasks.
export function makeTasks(id: string, lines: string[]) {
  const n = note(id)
  if (!n) return []
  const made = lines.map((line) =>
    addTask({
      title: line,
      space: 'general',
      assignee: state.me,
      priority: null,
      description: `<p>From your note “${(n.title || 'Untitled').replace(/</g, '&lt;')}”.</p>`,
    }),
  )
  made.forEach((t: any, i: number) => n.made.push({ line: lines[i], task: t.id }))
  n.updatedAt = now()
  return made
}

// Add one task that Suggest tasks (AI) came up with. Home = your own task; a project = its milestone, done by
// the person (or the milestone's team).
// ws: which workspace's My tasks a task with no project goes to (Round 254); Personal when not given
export function addSuggested(id: string, s: { title: string; desc?: string; description?: string; due?: string | null; priority?: string | null; person?: string | null; project?: string | null; milestone?: string | null; ws?: string | null }) {
  const n = note(id)
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const d = (s.desc ?? s.description ?? '').trim()
  const description = `${d ? `<p>${esc(d)}</p>` : ''}<p>From your note “${esc(n?.title || 'Untitled')}”.</p>`
  const t = s.project
    ? addTask({ title: s.title.trim(), space: s.project, milestone: s.milestone || null, assignee: s.person || null, priority: s.priority || null, due: s.due || null, description })
    : addTask({ title: s.title.trim(), space: 'general', ws: s.ws || myPersonalWs.value?.id, assignee: state.me, priority: s.priority || null, due: s.due || null, description })
  if (n) {
    n.made.push({ line: t.title, task: t.id })
    n.updatedAt = now()
  }
  return t
}

// "Today", "Yesterday", "This week", "Earlier" groups for the list
export function groupLabel(at: string) {
  const d = dayjs().startOf('day').diff(dayjs(at).startOf('day'), 'day')
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d <= 7 ? 'This week' : 'Earlier'
}
