import { personName, project, wsById } from './store'

// What the invitation card (Studio Component `invite_card`) shows. Moved here from the prototype's
// components/InviteWelcome.vue. Two kinds:
//   workspace — at sign-up: "Join Frappe". The mark is the workspace's letter.
//   project   — "Join Gameplan". The mark is a folder (with its workspace's letter on the corner). Two places:
//               sign-up (someone outside the workspace invited from a project): accepting also adds you to the workspace
//               in the app (already in the workspace): the project page shows this until you answer
// One black button (Accept invitation). The other: Skip for now (sign-up: the invitation stays in notifications)
// or Decline (in the app: the person who invited you is told). The page script binds the card to `invitation` and
// gives it `inviteAccept()` and `inviteSkip()`.
export function inviteCard(o: { kind: 'workspace' | 'project'; wsId: string | null; pid?: string | null; by: string | null; inApp?: boolean }) {
  const w = wsById(o.wsId)
  const p = o.pid ? project(o.pid) : null
  const byName = personName(o.by)
  const text =
    o.kind === 'workspace'
      ? `${byName} invited you to join the ${w?.name} workspace${p ? ` and work on ${p.name}` : ''}.`
      : o.inApp
        ? `${byName} invited you to work on this project with the team.`
        : `${byName} invited you to the ${p?.name} project in ${w?.name}.`
  const footer =
    o.kind === 'workspace'
      ? 'Not now? You can accept it later from your notifications.'
      : !o.inApp
        ? `Accepting also adds you to the ${w?.name} workspace as a Member.`
        : `${byName} will be notified of your answer.`
  return {
    kind: o.kind,
    initial: (w?.name || '?').trim()[0]?.toUpperCase(),
    title: `Join ${o.kind === 'project' && p ? p.name : w?.name}`,
    text,
    footer,
    skipLabel: o.inApp ? 'Decline' : 'Skip for now',
    // In the sign-up card: full width, 24px under the text. In the app (project page): narrower, more air.
    buttonsWidth: o.inApp ? '320px' : '100%',
    buttonsGap: o.inApp ? '32px' : '24px',
  }
}
