import { ref, computed } from "vue"
import { useDemoState } from "@app/src/lib/variants"
import { setupNewUser } from "@app/src/lib/newUser"
import { inviteCard } from "@app/src/lib/inviteCard"
import { org, myWsInvites, answerWsInvite, ensurePersonalWs, createWorkspace, switchWorkspace, inviteToWs } from "@app/src/lib/store"

// First visit: your name, then
//   Invited (an invite is waiting for your email): one screen, Join {company} or Not now (InviteWelcome).
//   Not invited: Personal or Company? Company → name it, invite people (optional) → you're its Admin.
// Everyone gets a personal workspace either way.
export default function setup({ router }) {
	const step = ref<"name" | "use" | "team">("name")
	const name = ref("")
	const company = ref("")
	const emails = ref("")
	const invite = computed(() => myWsInvites.value[0] || null)
	// Demo state (Variants "Invite from"): Workspace = an Admin invited them to Frappe; Project = someone invited
	// them from inside Gameplan (accepting adds them to both).
	const inviteFrom = useDemoState("Invite from", ["Workspace", "Project"])
	const invited = computed(() => step.value === "use" && !!invite.value)
	const inviteKind = computed(() => (inviteFrom.value === "Project" && invite.value?.inv.projects?.length ? "project" : "workspace"))
	const emailList = computed(() =>
		emails.value
			.split(/[\s,;]+/)
			.map((e) => e.trim())
			.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
	)
	const emailNote = computed(() =>
		emailList.value.length
			? `${emailList.value.length} ${emailList.value.length === 1 ? "invite" : "invites"} will be sent.`
			: "You can invite people later from Settings.",
	)
	// Each step's heading (the invitation brings its own)
	const head = computed(() =>
		step.value === "name"
			? { title: "Welcome to Tasks", subtitle: "Plan your work, hand off tasks, see them done." }
			: step.value === "team"
				? { title: "Set up your company", subtitle: "You'll be its Admin. You also get a personal workspace for your own projects." }
				: invite.value
					? { title: "", subtitle: "" }
					: { title: "What are you using Tasks for?", subtitle: "You can add the other one later." },
	)
	const canSaveName = computed(() => !!name.value.trim())
	const canCreateTeam = computed(() => !!company.value.trim())

	function saveName() {
		if (!name.value.trim()) return
		setupNewUser({ name: name.value })
		if (!org.on) return router.replace("/")
		step.value = "use"
	}
	function joinInvited() {
		answerWsInvite(invite.value!.w.id, true)
		router.replace("/projects")
	}
	// Not now / Personal: your personal workspace. An invite stays in Notifications to join later.
	function personal() {
		switchWorkspace(ensurePersonalWs(), true)
		router.replace("/")
	}
	const toTeam = () => (step.value = "team")
	const backToUse = () => (step.value = "use")
	function createTeam() {
		if (!company.value.trim()) return
		createWorkspace(company.value)
		emailList.value.forEach((e) => inviteToWs(e))
		router.replace("/projects")
	}
	// The invitation card (Studio Component invite_card): Accept joins, Skip goes to your personal workspace
	const invitation = computed(() =>
		invite.value
			? inviteCard({ kind: inviteKind.value, wsId: invite.value.w.id, pid: invite.value.inv.projects?.[0] || null, by: invite.value.inv.by })
			: null,
	)
	return {
		invitation, inviteAccept: () => joinInvited(), inviteSkip: () => personal(),
		step, name, company, emails, invite, invited, inviteKind, emailNote, head, canSaveName, canCreateTeam,
		saveName, joinInvited, personal, toTeam, backToUse, createTeam,
	}
}
