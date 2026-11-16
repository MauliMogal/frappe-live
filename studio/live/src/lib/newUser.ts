import { state, person } from './store'

// A new person types their name on /welcome and lands on My tasks. No roles to pick.
// They start with nothing: no tasks, no notes, no projects, no pins, no notifications.
// Every page shows its empty state with the one next step (New task, New note, New project or Join).
// (The old starter tasks were removed: two of them were personal tasks given by someone else,
// which My tasks no longer allows.)

export const NEW_USER = 'newbie'

// Anyone can create projects, so there's nothing to ask beyond the name.
export function setupNewUser(o: { name: string }) {
  const id = NEW_USER
  const p = person(id)!
  Object.assign(p, { name: o.name.trim(), onboarded: true })
  state.onboarding[id] = { skipped: [], dismissed: false, inbox: false }
}

// Kept for older callers: there are no starter tasks, so there is nothing to clear.
export const hasSamples = () => false
export function clearSamples() {}
