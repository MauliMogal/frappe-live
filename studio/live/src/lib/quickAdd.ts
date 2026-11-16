import dayjs from 'dayjs'

// Turns "Audit icons #gameplan @swarali fri !1" into fields. Priority: !1 (urgent) to !5 (someday).
// Words in "quotes" stay literal.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function nextWeekday(name: string) {
  const target = DAYS.indexOf(name.slice(0, 3).toLowerCase())
  let d = dayjs()
  for (let i = 1; i <= 7; i++) {
    d = dayjs().add(i, 'day')
    if (d.day() === target) return d
  }
  return d
}

function monthDay(m: string, dd: string) {
  const month = MONTHS.indexOf(m.slice(0, 3).toLowerCase())
  let d = dayjs().month(month).date(parseInt(dd, 10))
  if (d.isBefore(dayjs(), 'day')) d = d.add(1, 'year')
  return d
}

const DATE_RULES: [RegExp, (m: RegExpMatchArray) => any][] = [
  [/\btoday\b/i, () => dayjs()],
  [/\b(tomorrow|tmr)\b/i, () => dayjs().add(1, 'day')],
  [/\bnext week\b/i, () => nextWeekday('mon')],
  [/\bin (\d+) days?\b/i, (m) => dayjs().add(parseInt(m[1], 10), 'day')],
  [/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, (m) => monthDay(m[2], m[1])],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})\b/i, (m) => monthDay(m[1], m[2])],
  [
    /\b(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i,
    (m) => nextWeekday(m[1]),
  ],
]

export type Parsed = {
  title: string
  assignee: string | null
  space: string | null
  priority: string | null
  due: string | null
  dueText: string | null
}

export function parseQuickAdd(input: string, people: any[], spaces: { id: string; name: string; code?: string }[]): Parsed {
  const out: Parsed = { title: '', assignee: null, space: null, priority: null, due: null, dueText: null }
  const quoted: string[] = []
  let text = input.replace(/"([^"]*)"/g, (_m, q) => {
    quoted.push(q)
    return ` §${quoted.length - 1}§ `
  })

  text = text.replace(/(^|\s)@([a-z]+)/gi, (m, s, name) => {
    const p = people.find((p) => p.id === name.toLowerCase() || p.name.toLowerCase() === name.toLowerCase())
    if (p && !out.assignee) {
      out.assignee = p.id
      return s
    }
    return m
  })

  text = text.replace(/(^|\s)#([a-z0-9-]+)/gi, (m, s, name) => {
    const n = name.toLowerCase()
    const sp = spaces.find((x) => x.id === n || x.name.toLowerCase() === n || x.code?.toLowerCase() === n)
    if (sp && !out.space) {
      out.space = sp.id
      return s
    }
    return m
  })

  text = text.replace(/(^|\s)!p?([1-5])\b/i, (_m, s, n) => {
    out.priority = `p${n}`
    return s
  })

  for (const [re, fn] of DATE_RULES) {
    const m = text.match(re)
    if (m) {
      const d = fn(m)
      out.due = d.format('YYYY-MM-DD')
      out.dueText = m[0]
      text = text.replace(m[0], ' ')
      break
    }
  }

  text = text.replace(/§(\d+)§/g, (_m, i) => quoted[parseInt(i, 10)])
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}
