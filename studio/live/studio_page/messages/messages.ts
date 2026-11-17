import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"

// Messages: conversations, feedback, the plan and Office Hours for each onboarding. The view is LiveMessages.
// Icons it uses (Studio collects icons from page files): lucide-calendar lucide-message-circle lucide-arrow-left
// lucide-arrow-up-right lucide-arrow-up lucide-chart-column lucide-check lucide-user-plus
export default function setup({ router, route }) {
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route) }
}
