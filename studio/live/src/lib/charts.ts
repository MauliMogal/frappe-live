// The only chart colours (Frappe UI chart palette), for Frappe UI charts and for our own drawn ones.
// ECharts needs real colours, not CSS tokens, so they live here as values.
export const PALETTE = {
  // For things that aren't related (people, categories). Five hues, dark then light.
  categorical: ['#2581c4', '#85c5f8', '#2b9d61', '#87d4a1', '#783ebd', '#bb9ff1', '#cb8b2a', '#f4ca8e', '#c64a57', '#fda0a6'],
  // One measure from high to low
  sequential: ['#0b5798', '#2181c3', '#4baadd', '#73bbe4', '#91caea', '#9dd1ec', '#b8dff1', '#ddeefa', '#eef5fd'],
  // Above / below a middle point (e.g. actual against plan)
  diverging: ['#3a6ba1', '#5b8fc1', '#81aedd', '#a8d3f9', '#fbf1c9', '#efc98d', '#e0a063', '#ce724a', '#b84a42'],
}
const C = PALETTE.categorical

// Meaning → colour. Every colour stands for one thing, everywhere; anything else stays grey.
//   blue   = in progress / actual / open work      (light blue: the lighter or remaining part)
//   green  = done / completed                      (light green: done tasks)
//   amber  = at risk                               (light amber: its tint)
//   red    = late / overdue                        (light red: overdue tasks)
//   grey   = planned, not started, no meaning
export const MEANING = {
  progress: C[0],
  progressLight: C[1],
  done: C[2],
  doneLight: C[3],
  risk: C[6],
  riskLight: C[7],
  late: C[8],
  lateLight: C[9],
  neutral: '#a3a3a3',
  neutralLight: '#e5e5e5',
}

export const STATUS_COLOR: Record<string, string> = {
  backlog: MEANING.neutralLight,
  todo: MEANING.neutral,
  progress: MEANING.progress,
  done: MEANING.done,
}
export const WORK_COLOR = { Done: MEANING.done, Open: MEANING.progressLight, Overdue: MEANING.late }
// Planned is a reference line, so grey; actual is the work, so blue
export const PLAN_COLOR = { Planned: MEANING.neutral, Actual: MEANING.progress }
// Timeline roadmap: a milestone's bar by its status; task bars (when opened) by theirs
export const ROADMAP = {
  on: MEANING.progress,
  risk: MEANING.risk,
  late: MEANING.late,
  done: MEANING.done,
  notstarted: MEANING.neutral,
  task: MEANING.progressLight,
  taskDone: MEANING.doneLight,
  taskLate: MEANING.lateLight,
}
// People have no meaning of their own: categorical colours, in order
export const PEOPLE_COLORS = C
// Static charts: no entry animation, so screens and screenshots settle at once.
export const STILL = { animation: false }
