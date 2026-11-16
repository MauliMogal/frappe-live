import { computed } from "vue"
import { toast } from "frappe-ui"
import { state, person, personName, project, task, signIn, finishOnboarding, signOut, addMember } from "@app/src/lib/store"
import { org, workspaces, ensurePersonalWs, currentWsOf } from "@app/src/lib/store"

// An invite link (/invite/<token>). Invited people skip setup and land on the first useful screen.
// Four states, all Studio blocks in the sign-in card: the link doesn't work · it expired · you're signed in as
// someone else · valid (who invited you, Join …, your first task, Continue).
export default function setup({ router, route }) {
	// The token from the link (in the Studio editor: the route variable, else the only invite link in the data)
	const token = computed(() => String(route?.params?.token || "old-link"))
	const invite = computed(() => state.invites.find((i: any) => i.token === token.value) || null)
	const inviter = computed(() => personName(invite.value?.invitedBy || null))
	const invitee = computed(() => person(invite.value?.user || null))
	const proj = computed(() => project(invite.value?.project || null))
	const firstTask = computed(() => task(invite.value?.task || null))
	const wrongPerson = computed(
		() => !!invitee.value && state.signedIn && invitee.value.id !== state.me && !!person(state.me)?.onboarded,
	)

	// Which state shows
	const broken = computed(() => !invite.value)
	const expired = computed(() => !!invite.value?.expired)
	const forSomeoneElse = computed(() => !!invite.value && !invite.value.expired && wrongPerson.value)
	const valid = computed(() => !!invite.value && !invite.value.expired && !wrongPerson.value)

	const expiredText = computed(() => `Ask ${inviter.value} for a new one.`)
	const wrongTitle = computed(() => `This invite is for ${invitee.value?.email}`)
	const wrongText = computed(() => `You're logged in as ${personName(state.me)}.`)
	const invitedLine = computed(() => `${inviter.value} invited you`)
	const joinTitle = computed(() => (proj.value ? `Join ${proj.value.name}` : `Join ${state.workspace.name}`))
	const firstTaskTitle = computed(() => firstTask.value?.title || "")
	const firstTaskNote = computed(() =>
		firstTask.value?.reviewer ? `${inviter.value} checks it when you're done.` : `${inviter.value} is told when you're done.`,
	)
	const canCreateNote = computed(() => !firstTask.value && !!invitee.value?.canCreateProjects)
	const continueLabel = computed(() => (invitee.value ? `Continue as ${invitee.value.name}` : "Continue"))
	const notYou = computed(() => `Not ${invitee.value?.name || "you"}?`)

	function accept() {
		const inv: any = invite.value
		if (!inv) return
		signIn()
		finishOnboarding(inv.user)
		// Clicking the invite link is already a yes: straight into the company as a Member, no Personal / Company
		// question; a personal workspace is made for them in the background.
		if (org.on && inv.user) {
			const w = workspaces.find((x: any) => x.id === "frappe")
			if (w && !w.members.some((m: any) => m.user === inv.user)) w.members.push({ user: inv.user, role: "Member" })
			ensurePersonalWs(inv.user)
			currentWsOf[inv.user] = "frappe"
		}
		// A project invite makes you a member when you accept, not before
		if (inv.project && inv.user) addMember(inv.project, inv.user)
		if (inv.task) {
			state.hints.submitHint = inv.user
			router.replace({ path: proj.value ? `/p/${proj.value.id}` : "/", query: { task: inv.task } })
		} else {
			if (invitee.value?.canCreateProjects) state.hints.canCreate = inv.user
			router.replace("/")
		}
	}
	const askAgain = () => toast.success(`We'll let ${inviter.value} know you need a new link.`)
	function switchAccount() {
		signOut()
		router.replace("/login")
	}
	const goLogin = () => router.replace("/login")
	const goHome = () => router.replace("/")

	return {
		broken, expired, forSomeoneElse, valid,
		inviter, expiredText, wrongTitle, wrongText, invitedLine, joinTitle,
		hasFirstTask: computed(() => !!firstTask.value), firstTaskTitle, firstTaskNote, canCreateNote, continueLabel, notYou,
		accept, askAgain, switchAccount, goLogin, goHome,
	}
}
