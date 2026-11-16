// People in the prototype. Two teammates and a brand-new person.
// No roles: everyone works the same way. The only difference is one permission,
// canCreateProjects, set by whoever invites you (and changeable in Settings → People).
// isAdmin: can invite people and change workspace settings.
// onboarded: false shows the first-visit flow when this person signs in.
// Sign-in: a person is matched to a Frappe user by `user` (or else by email). See tasks/ft/api.py.
export const people = [
  {
    id: 'swarali',
    name: 'Swarali',
    role: 'Design intern',
    email: 'swarali@example.com',
    isAdmin: false,
    canCreateProjects: false,
    onboarded: true,
  },
  {
    id: 'neha',
    name: 'Neha',
    role: 'Product manager',
    email: 'neha@example.com',
    isAdmin: true,
    canCreateProjects: true,
    onboarded: true,
  },
  // Signs in as the site's Administrator. Workspace admin of Frappe, in no project yet.
  {
    id: 'admin',
    name: 'Admin',
    role: 'Workspace admin',
    email: 'admin@example.com',
    user: 'Administrator',
    isAdmin: true,
    canCreateProjects: true,
    onboarded: true,
  },
  // Data only (no login): owns Helpdesk, so Neha is a Member there and her sidebar shows Leading and Member.
  {
    id: 'rohan',
    name: 'Rohan',
    role: 'Support lead',
    email: 'rohan@example.com',
    isAdmin: false,
    canCreateProjects: true,
    onboarded: true,
  },
  // The wider team (data only, no login), so projects look like a real organisation: 6–10 people each.
  ...[
    ['priya', 'Priya', 'Frontend developer'],
    ['karan', 'Karan', 'Backend developer'],
    ['ishaan', 'Ishaan', 'QA engineer'],
    ['riya', 'Riya', 'Product designer'],
    ['dev', 'Dev', 'Product analyst'],
    ['ananya', 'Ananya', 'Content writer'],
    ['kabir', 'Kabir', 'Mobile developer'],
    ['tara', 'Tara', 'Support engineer'],
  ].map(([id, name, role]) => ({ id, name, role, email: `${id}@example.com`, isAdmin: false, canCreateProjects: false, onboarded: true })),
  // A brand-new person (signs in as newbie@example.com). Picks a name on /welcome, then lands on Home.
  {
    id: 'newbie',
    name: 'New user',
    role: '',
    email: 'newbie@example.com',
    isAdmin: false,
    canCreateProjects: false,
    onboarded: false,
  },
]
