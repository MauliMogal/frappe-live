import dayjs from 'dayjs'

// Mock-data helpers. Everything is relative to today, so data never feels old.
export const day = (offset: number) => dayjs().add(offset, 'day').format('YYYY-MM-DD')
export const at = (offsetDays: number, hour = 10, minute = 0) =>
  dayjs().add(offsetDays, 'day').hour(hour).minute(minute).second(0).toISOString()
export const hoursAgo = (h: number) => dayjs().subtract(h, 'hour').toISOString()
export const minsAgo = (m: number) => dayjs().subtract(m, 'minute').toISOString()
export const now = () => dayjs().toISOString()

const startOfToday = () => dayjs().startOf('day')

const OPEN = ['backlog', 'todo', 'progress']

export function isOverdue(t: any) {
  return !!t.due && OPEN.includes(t.status) && dayjs(t.due).isBefore(startOfToday(), 'day')
}
export function isDueToday(t: any) {
  return !!t.due && dayjs(t.due).isSame(startOfToday(), 'day')
}
export function daysOverdue(t: any) {
  return startOfToday().diff(dayjs(t.due).startOf('day'), 'day')
}

// "Overdue · 2 days", "Today", "Tomorrow", "Fri", "17 Oct"
export function dueInfo(due: string | null, status: string) {
  if (!due) return null
  const d = dayjs(due).startOf('day')
  const diff = d.diff(startOfToday(), 'day')
  if (OPEN.includes(status) && diff < 0) {
    const n = -diff
    return { text: `Overdue · ${n} ${n === 1 ? 'day' : 'days'}`, tone: 'overdue' }
  }
  if (diff === 0) return { text: 'Today', tone: 'soon' }
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' }
  if (diff === -1) return { text: 'Yesterday', tone: 'normal' }
  if (diff > 1 && diff < 7) return { text: d.format('ddd'), tone: 'normal' }
  return { text: d.format('D MMM'), tone: 'normal' }
}

export function longDate(date: string | null) {
  if (!date) return ''
  return dayjs(date).format('ddd D MMM')
}

// "Just now", "5m ago", "2h ago", "Yesterday", "Mon", "13 Oct"
export function relTime(iso: string) {
  const t = dayjs(iso)
  const mins = dayjs().diff(t, 'minute')
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = dayjs().diff(t, 'hour')
  if (hrs < 24 && t.isSame(dayjs(), 'day')) return `${hrs}h ago`
  if (t.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday'
  if (dayjs().diff(t, 'day') < 7) return t.format('ddd')
  return t.format('D MMM')
}

// "5h", "2 days"
export function waited(iso: string) {
  const hrs = dayjs().diff(dayjs(iso), 'hour')
  if (hrs < 1) return 'just now'
  if (hrs < 24) return `${hrs}h`
  const d = Math.floor(hrs / 24)
  return `${d} ${d === 1 ? 'day' : 'days'}`
}
export function waitedDays(iso: string) {
  return Math.floor(dayjs().diff(dayjs(iso), 'hour') / 24)
}

export function withinDays(iso: string | null, n: number) {
  return !!iso && dayjs().diff(dayjs(iso), 'day') < n
}
