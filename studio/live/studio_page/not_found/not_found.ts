import { pageHeader } from "@app/src/lib/pageHeader"
import { notificationsPanel } from "@app/src/lib/notificationsPanel"
import { appSidebar } from "@app/src/lib/sidebar"

// Not found: header + empty state, all blocks
export default function setup({ router, route }) {
	return { ...pageHeader(router), ...appSidebar(router, route), ...notificationsPanel(router, route) }
}
