import { reactive, ref } from 'vue'
import { emptyFilters } from './taskView'

// Per-screen view and filters. Kept for the session, so coming back to a screen feels the same.
// Projects open on Milestones; Home on List.
// All projects: Folders on desktop, List on phones (each remembered on its own, so a phone choice doesn't change desktop)
export const views = reactive<Record<string, string>>({ home: 'list', general: 'list', project: 'milestones', projects: 'cards', projectsMobile: 'list' })
// Home: grouped by When (To review · Today · Upcoming · Waiting · Done), sorted by Priority.
// homeChip: the quick filter chip (all · overdue · week · urgent · nodate).
export const homeChip = ref('all')
export const filters = reactive<Record<string, any>>({
  home: { ...emptyFilters(), sort: 'priority', groupBy: 'when' },
  general: emptyFilters(),
})
