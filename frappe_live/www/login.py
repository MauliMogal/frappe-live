# Frappe Live login: Frappe's own login page, with a title that says
# what you are signing in to. Everything else comes from frappe.www.login.
import frappe
from frappe.www import login as _frappe_login
from frappe.www.login import *  # noqa: F401,F403 (keeps login_via_* endpoints)

no_cache = True


def get_context(context):
	out = _frappe_login.get_context(context)
	ctx = out or context
	ctx["title"] = "Sign in to Frappe Live"
	ctx["app_name"] = "Frappe Live"
	return out
