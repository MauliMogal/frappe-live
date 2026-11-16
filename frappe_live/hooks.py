app_name = "frappe_live"
app_title = "Frappe Live"
app_publisher = "Mauli Mogal"
app_description = "Go live on Frappe: one place for every assisted onboarding, with a plan made for each customer"
app_email = "mauli@frappe.io"
app_license = "mit"

use_json_request_body = True
export_python_type_annotations = True
require_type_annotated_api_methods = True

required_apps = ["studio"]

after_install = "frappe_live.install.after_install"
after_migrate = "frappe_live.install.after_install"

# Roles come from the email: the admin domain gets Live Admin, listed emails get Live Super Admin,
# everyone else Live User (see frappe_live.access)
doc_events = {
	"User": {
		"after_insert": "frappe_live.access.on_user_insert",
	},
}
on_session_creation = "frappe_live.access.on_session_creation"

# Studio app "live" (studio/live): what the signed-in person may see, as the global `boot`
studio_app_boot = {"live": "frappe_live.api.get_boot"}
