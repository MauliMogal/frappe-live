import { hoursAgo, at } from '../lib/dates'

// tab: 'needs' (Action needed) or 'updates' (Updates)
// type matches the triggers in docs/03 section 9 (N1, N2 ...). One per flow in the demo data.
export const notifications = [
  // Swarali
  { id: 'n1', to: 'swarali', type: 'N4', tab: 'needs', actor: 'neha', task: 'GP-1', at: hoursAgo(3), read: false },
  { id: 'n2', to: 'swarali', type: 'N5', tab: 'needs', actor: 'neha', task: 'GP-1', at: hoursAgo(3), read: false },
  { id: 'n3', to: 'swarali', type: 'N3', tab: 'needs', actor: 'neha', task: 'GP-5', at: at(-3, 10), read: true },
  // Status updates from project Owners reach everyone in the project (Updates tab)
  { id: 'n5', to: 'swarali', type: 'N20', tab: 'updates', actor: 'neha', project: 'crm', health: 'risk', note: 'Kanban beta moved twice: the custom fields API is late. Deals page polish is still on for Monday.', at: hoursAgo(30), read: false },
  { id: 'n6', to: 'swarali', type: 'N20', tab: 'updates', actor: 'neha', project: 'erpnext', health: 'on', note: 'Accounting screens are in review. Beta date holds.', at: hoursAgo(50), read: true },
  { id: 'n4', to: 'swarali', type: 'N17', tab: 'needs', actor: 'neha', task: 'CRM-3', subtask: 'Design the field picker menu', at: hoursAgo(6), read: true },

  // Neha
  { id: 'n10', to: 'neha', type: 'N2', tab: 'needs', actor: 'swarali', task: 'CRM-1', at: hoursAgo(26), read: false },
  { id: 'n11', to: 'neha', type: 'N6', tab: 'needs', actor: 'swarali', task: 'CRM-2', kind: 'date', at: hoursAgo(2), read: false },
  { id: 'n12', to: 'neha', type: 'N2', tab: 'needs', actor: 'swarali', task: 'GP-2', at: at(-3, 17), read: false },
  { id: 'n13', to: 'neha', type: 'N6', tab: 'needs', actor: 'swarali', task: 'GP-3', kind: 'info', at: hoursAgo(1), read: false },
  { id: 'n16', to: 'neha', type: 'N20', tab: 'updates', actor: 'karan', project: 'cloud', health: 'off', note: 'Site setup slipped: the new region is not ready.', at: hoursAgo(20), read: false },
  { id: 'n14', to: 'neha', type: 'N18', tab: 'needs', actor: 'swarali', task: 'CRM-5', at: hoursAgo(4), read: false },
  { id: 'n17', to: 'neha', type: 'N13', tab: 'needs', actor: 'tara', project: 'gameplan', at: hoursAgo(2), read: false },
]
