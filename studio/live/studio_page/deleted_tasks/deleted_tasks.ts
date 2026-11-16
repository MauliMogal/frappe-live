import { computed } from "vue"
import dayjs from "dayjs"
import { toast } from "frappe-ui"
import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"
import { deletedTasks, restoreDeleted, spaceName, personName, project, task } from "@app/src/lib/store"
import { relTime } from "@app/src/lib/dates"

// Tasks you deleted (or deleted in projects you lead). Restore within 30 days.
export default function setup({ router, route }) {
	const daysLeft = (iso: string) => 30 - dayjs().diff(dayjs(iso), "day")
	// One row per task: the title, then where it was · who deleted it · when · days left
	const rows = computed(() =>
		deletedTasks.value.map((t: any) => ({
			id: t.id,
			title: t.title,
			meta: `${spaceName(t.space)} · deleted by ${personName(t.deletedBy)} · ${relTime(t.deletedAt)} · ${daysLeft(t.deletedAt)} days left`,
		})),
	)
	function restore(id: string) {
		const t: any = task(id)
		if (!t) return
		if (t.space !== "general" && !project(t.space)) {
			toast.error(`${t.title} can't come back: its project was deleted.`)
			return
		}
		restoreDeleted(t.id)
		toast.success(`Restored to ${spaceName(t.space)}.`)
	}
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route), rows, restore }
}
