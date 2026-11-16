import dayjs from 'dayjs'
import { state, isMember, nextMilestone, personName, milestonesOf } from './store'

// Prototype "AI": turns a note into suggested tasks. Faked with simple rules, but shaped like a real
// model's answer, so the UI can be judged: short titles, the longer thought kept as a description,
// a deadline caught from words like "by Sunday", a person when it says to ask Ananya, and the quote it came from.
// Lines that aren't work ("Neha liked option B") are left out.

export type Suggestion = {
  id: string
  title: string
  description: string
  due: string | null // YYYY-MM-DD
  dueFrom: string // the words the date came from, e.g. "by Sunday"
  person: string | null // user id: only on project tasks (Home is just yours)
  source: string // the sentence or line it came from
  project: string | null // a project it belongs to (named in the text, or shared with the person); null = Home
  milestone: string | null // the milestone it lands in, in that project
}

// Where a suggestion goes. Home is only for your own work, so:
//   it names a project you're in ("…the CRM Kanban beta…")   → that project, its next milestone
//   it's for someone else, and you share a project with them  → that project (their task)
//   it's for someone else, no shared project                  → Home, as your task: "Ask Priya to …"
function findProject(text: string) {
  const mine = state.projects.filter((p: any) => p.status !== 'archived' && isMember(p.id))
  return mine.find((p: any) => new RegExp(`\\b${p.name.split(' ')[0]}\\b`, 'i').test(text))?.id || null
}
export function place<T extends { title: string; person: string | null; source: string; project?: string | null; milestone?: string | null }>(s: T) {
  let project = s.project === undefined ? findProject(s.source) : s.project
  let person = s.person
  let title = s.title
  if (person && !project) {
    // A shared project only counts when the text names it; otherwise it's a favour you ask: your task.
    const first = personName(person).split(' ')[0]
    // (Not when the title already names them: "Pair with Priya" stays as it is, not "Ask Priya to pair with Priya")
    if (!/^ask\b/i.test(title) && !new RegExp(`\\b${first}\\b`, 'i').test(title)) title = `Ask ${first} to ${title.charAt(0).toLowerCase()}${title.slice(1)}`
    person = null
  }
  if (project && person && !isMember(project, person)) person = null
  return { ...s, title, person, project, milestone: project ? s.milestone || nextMilestone(project)?.id || null : null }
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// "by Sunday", "before next week", "tomorrow", "end of the week", "25 Oct" → a date and the words it came from
export function findDate(text: string): { due: string | null; from: string } {
  const t0 = dayjs().startOf('day')
  const lead = '(?:\\b(?:by|before|on|due|until|till|this|next)\\s+)?'
  const tries: [RegExp, (m: RegExpMatchArray) => dayjs.Dayjs][] = [
    [new RegExp(`${lead}\\b(today|tonight)\\b`, 'i'), () => t0],
    [new RegExp(`${lead}\\btomorrow\\b`, 'i'), () => t0.add(1, 'day')],
    [new RegExp(`${lead}\\bend of (?:the )?week\\b`, 'i'), () => t0.day(5).isBefore(t0) ? t0.add(1, 'week').day(5) : t0.day(5)],
    [new RegExp(`${lead}\\bend of (?:the )?month\\b`, 'i'), () => t0.endOf('month').startOf('day')],
    [new RegExp(`\\b(?:by|before|until|till)\\s+next week\\b|\\bnext week\\b`, 'i'), () => t0.add(1, 'week').day(1)],
    [
      new RegExp(`${lead}\\b(${DAYS.join('|')}|${Object.keys(SHORT).join('|')})\\b`, 'i'),
      (m) => {
        const w = m[1].toLowerCase()
        const d = DAYS.includes(w) ? DAYS.indexOf(w) : SHORT[w]
        let x = t0.day(d)
        if (!x.isAfter(t0)) x = x.add(1, 'week')
        return x
      },
    ],
    [
      new RegExp(`${lead}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*\\b`, 'i'),
      (m) => {
        let x = t0.month(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3))).date(Number(m[1]))
        if (x.isBefore(t0)) x = x.add(1, 'year')
        return x
      },
    ],
  ]
  for (const [re, fn] of tries) {
    const m = text.match(re)
    if (m) return { due: fn(m).format('YYYY-MM-DD'), from: m[0].trim() }
  }
  return { due: null, from: '' }
}

// "ask Ananya to…", "@priya", "Priya should…" → that person (not you)
function findPerson(text: string) {
  for (const p of state.people) {
    if (p.id === state.me || !p.name) continue
    const first = p.name.split(' ')[0]
    const re = new RegExp(`(?:\\b(?:ask|tell|ping|get|have|with)\\s+|@)${first}\\b|\\b${first}\\s+(?:should|to|will|can)\\b`, 'i')
    if (re.test(text)) return p.id
  }
  return null
}

// "…should feel lighter" is an opinion; "…need to fix…" is work. Only count should/need-to when a work verb follows.
const INTENT_VERB = /\b(?:should|need to|needs to|must|have to|has to|let'?s|i'?ll|we'?ll|remember to|don'?t forget to)\s+(\w+)/i
const ACTION =
  /^(?:please\s+)?(add|ask|book|build|call|check|clean|collect|compare|create|design|draft|email|explore|finish|fix|follow|get|interview|keep|look|make|move|plan|post|prepare|read|reach|record|remove|research|review|run|schedule|send|set|share|ship|sketch|start|talk|tell|test|try|update|write)\b/i
const FILLER =
  /^(?:(?:i think|i guess|maybe|perhaps|so|also|and|then|plus|ok|okay|honestly|probably|we should|we need to|i need to|need to|let'?s|i'?ll|we'?ll|should|have to|must|remember to|don'?t forget to|it would be (?:good|nice) to)[,\s]+)+/i

function toTitle(sentence: string, dueFrom: string) {
  let s = sentence
  if (dueFrom) s = s.replace(dueFrom, '')
  s = s
    .replace(/\(.*?\)/g, '')
    .replace(/[,;:]\s*(?:she|he|they|it|this|that|because|since|so)\b.*$/i, '') // drop the "why" part
    .replace(FILLER, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,.;:!?-]+$/, '')
    .trim()
  if (s.length > 64) s = s.slice(0, 64).replace(/\s+\S*$/, '') + '…'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function blocks(html: string) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()
  const out: { kind: 'item' | 'para'; text: string }[] = []
  doc.body.querySelectorAll('li, p, h1, h2, h3, h4, blockquote').forEach((el) => {
    if (el.tagName === 'P' && el.closest('li')) return
    if (el.tagName === 'LI' && el.querySelector('li')) return
    const t = text(el)
    if (t) out.push({ kind: el.tagName === 'LI' ? 'item' : 'para', text: t })
  })
  return out
}

export function suggestFromNote(html: string): Suggestion[] {
  const out: Suggestion[] = []
  blocks(html).forEach((b) => {
    // List items are tasks already; paragraphs are split into sentences and only the work is kept.
    const parts = b.kind === 'item' ? [b.text] : b.text.split(/(?<=[.!?])\s+/)
    parts.forEach((raw) => {
      const s = raw.trim()
      if (!s) return
      const clean = s.replace(FILLER, '')
      const iv = s.match(INTENT_VERB)
      const isWork = b.kind === 'item' || ACTION.test(clean) || (!!iv && ACTION.test(iv[1]))
      if (!isWork) return
      const d = findDate(s)
      const title = toTitle(s, d.from)
      if (!title) return
      // Keep the full thought as the description when the title had to shorten it
      const longer = s.replace(/\s+/g, ' ').length > title.length + 18
      out.push(
        place({
          id: `ai-${out.length}-${Date.now()}`,
          title,
          description: longer ? s : '',
          due: d.due,
          dueFrom: d.from,
          person: findPerson(s),
          source: s,
        }) as Suggestion,
      )
    })
  })
  return out
}

// The demo notes get hand-written answers, the quality a real model would give (short titles, the "why"
// kept as a description, opinions left out). Any other note goes through the rules above.
// project: where a model would put it (null = Home, your own task).
const CANNED: Record<string, { title: string; description: string; when?: string; person?: string; project?: string | null; ms?: string; source: string }[]> = {
  // Personal workspace: all your own ("Ask Riya" stays your task; there's nobody to give it to)
  'nt-p1': [
    { title: 'Renew my passport', description: 'It expires in March.', when: 'end of the month', project: null, source: 'Renew my passport before the end of the month, it expires in March.' },
    { title: 'Call the bank about the new card', description: '', project: null, source: 'Call the bank about the new card.' },
    { title: 'Book a dentist appointment', description: '', when: 'next week', project: null, source: 'Book a dentist appointment for next week.' },
    { title: 'Ask Riya to return the camera', description: 'Before the trip.', project: null, source: 'Ask Riya to return the camera before the trip.' },
    // A work task in a personal note: AI sends it to Frappe (Gameplan › Discussions v2); you do it
    { title: 'Send Neha the Discussions v2 flows', description: '', when: 'by Friday', project: 'gameplan', ms: 'Discussions', source: 'Also for work: send Neha the Discussions v2 flows by Friday.' },
  ],
  'nt-p5': [
    { title: 'Write the test script', description: '', when: 'next wednesday', project: 'taskmgr', ms: 'Usability', source: 'Write the test script by next Wednesday.' },
    { title: 'Ask the support team for 30-minute slots', description: '', project: 'taskmgr', ms: 'Usability', source: 'Ask the support team who can spare 30 minutes.' },
    { title: 'Record every session', description: '', project: 'taskmgr', ms: 'Usability', source: 'Record every session so I can share clips with Neha.' },
  ],
  'nt-p2': [
    { title: 'Write the intro for the Helpdesk case study', description: 'Show a clear before and after.', project: 'portfolio', ms: 'Helpdesk', source: 'Write the intro for the Helpdesk case study' },
    { title: 'Pick three screens for the Gameplan case study', description: '', project: 'portfolio', ms: 'Frappe Tasks', source: 'Pick three screens for the Gameplan case study' },
    { title: 'Buy the domain', description: '', project: 'portfolio', ms: 'Launch', source: 'Buy the domain before the launch' },
  ],
  'nt-8': [
    { title: 'Test AI suggestions with 5 support people', description: 'Before the demo. Try it on their real meeting notes and see what they fix by hand.', when: 'before the demo next week', project: null, source: 'We should test the AI suggestions with five people from the support team before the demo next week.' },
    { title: 'Write the Discussions empty-state copy', description: 'Ananya has the tone right.', when: 'by Sunday', person: 'ananya', project: 'gameplan', ms: 'Discussions', source: 'Maybe ask Ananya to write the Gameplan empty-state copy by Sunday, she has the tone right.' },
    { title: 'Fix the selection toolbar position', description: 'It sometimes covers the text you just selected.', project: null, source: 'Also the selection toolbar sometimes covers the text, need to fix its position.' },
  ],
  'nt-9': [
    { title: 'Book the offsite venue', description: 'Prices go up next month, so book now for the early price.', when: 'by Friday', project: null, source: 'Book the venue by Friday so we get the early price.' },
    { title: 'Ask Priya to collect food preferences', description: 'From everyone coming to the offsite.', project: null, source: 'Ask Priya to collect food preferences from everyone.' },
    { title: 'Record a Kanban beta demo video', description: 'For the CRM talk at the offsite.', when: 'before 30 Oct', person: 'karan', project: 'crm', ms: 'Kanban', source: 'The CRM Kanban beta needs a demo video before 30 Oct, Karan can record it.' },
    { title: 'Plan the two offsite talks', description: 'One on Gameplan, one on CRM. Short: keep the offsite to half a day.', when: 'before 30 Oct', project: null, source: 'We need to plan two short talks, one on Gameplan and one on CRM, before 30 Oct.' },
  ],
  'nt-10': [
    { title: 'Read the CRM roadmap doc', description: '', when: 'by tomorrow', project: null, source: 'I should read the CRM roadmap doc by tomorrow.' },
    { title: 'Comment on the thread view flow', description: 'In the Discussions v2 flows.', when: 'by Friday', project: 'gameplan', ms: 'Discussions', source: 'Leave comments on the Gameplan thread view flow by Friday.' },
    { title: 'Ask Neha which project to shadow', description: '', project: null, source: 'Ask Neha which project I should shadow first.' },
    { title: 'Set up Figma and join the design channel', description: '', project: null, source: 'Set up my Figma account and join the design channel.' },
  ],
}
function canned(noteId: string) {
  return (CANNED[noteId] || []).map((c, i) => {
    const d = c.when ? findDate(c.when) : { due: null, from: '' }
    // The milestone a model would pick from the words ("Kanban beta" → the Kanban beta milestone)
    const ms = c.project && c.ms ? milestonesOf(c.project).find((m: any) => m.name.toLowerCase().includes(c.ms!.toLowerCase()))?.id || null : null
    return place({ id: `ai-${noteId}-${i}`, title: c.title, description: c.description, due: d.due, dueFrom: c.when || '', person: c.person || null, project: c.project ?? null, milestone: ms, source: c.source })
  })
}

// Pretend to think for a moment, like a real call would
export const suggestTasks = (html: string, noteId = '') =>
  new Promise<Suggestion[]>((res) => setTimeout(() => res(CANNED[noteId] ? canned(noteId) : suggestFromNote(html)), 1100))
