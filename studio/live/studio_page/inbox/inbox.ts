import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"

// Inbox: the team's home. What needs you today. The view is LiveInbox.
// Icons it uses (Studio collects icons from page files): lucide-message-circle lucide-life-buoy lucide-map
// lucide-clock lucide-circle-check-big lucide-check lucide-hourglass lucide-layout-grid lucide-alarm-clock lucide-inbox
export default function setup({ router, route }) {
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route) }
}
