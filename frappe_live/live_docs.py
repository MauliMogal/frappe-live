# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Controllers for the Live doctypes: onboarding details, feedback, messages, MRR, sessions, checks.

Every Live record names a project by its id (`project`). Who may read it follows the project:
staff read all, a customer reads the records of projects they are a member of
(`has_permission` and `permission_query` below, wired in hooks.py).
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_first_day, getdate

from frappe_live.access import level


def _project(project_id: str) -> dict | None:
	data = frappe.db.get_value("Live Project", project_id, "data")
	return frappe.parse_json(data) if data else None


def _person_id(user: str) -> str | None:
	from frappe_live.api import _all, find_me

	p = find_me(_all("people"), user)
	return p.get("id") if p else None


def visible_projects(user: str | None = None) -> list[str] | None:
	"""Project ids a person may see. None means every project (staff)."""
	from frappe_live.api import viewer_for

	user = user or frappe.session.user
	if level(user) in ("super", "admin"):
		return None
	return sorted(viewer_for(user).visible)


def can_see_project(project_id: str, user: str | None = None) -> bool:
	vis = visible_projects(user)
	return vis is None or project_id in vis


def staff(user: str | None = None) -> bool:
	return level(user or frappe.session.user) in ("super", "admin")


# permission hooks (hooks.py: has_permission, permission_query_conditions)


def has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if staff(user):
		return True
	if not can_see_project(doc.get("project"), user):
		return False
	if ptype in ("read", "print", "report"):
		return True
	if ptype == "create":
		return doc.doctype in ("Live Feedback", "Live Message")
	if ptype == "write":
		return doc.doctype == "Live Feedback" and doc.get("from_user") == user
	return False


def permission_query(user=None, doctype=None):
	user = user or frappe.session.user
	if staff(user):
		return ""
	ids = visible_projects(user) or []
	if not ids:
		return "1=0"
	table = f"`tab{doctype}`" if doctype else ""
	quoted = ", ".join(frappe.db.escape(i) for i in ids)
	return f"{table}.`project` in ({quoted})" if table else f"`project` in ({quoted})"


def _qc(doctype):
	return lambda user=None: permission_query(user, doctype)


onboarding_query = _qc("Live Onboarding")
feedback_query = _qc("Live Feedback")
message_query = _qc("Live Message")
mrr_query = _qc("Live MRR")
session_query = _qc("Live Session")
check_query = _qc("Live Check")


class _LiveDoc(Document):
	def validate(self):
		if self.get("project") and not _project(self.project):
			frappe.throw(_("No project {0}.").format(self.project))
		if self.get("project") and not can_see_project(self.project):
			frappe.throw(_("You can't add to this project."), frappe.PermissionError)


class LiveOnboarding(_LiveDoc):
	def validate(self):
		super().validate()
		if not staff():
			frappe.throw(_("Only the team can change onboarding details."), frappe.PermissionError)


class LiveFeedback(_LiveDoc):
	def before_insert(self):
		self.from_user = frappe.session.user
		if not self.summary:
			self.summary = (self.details or self.type or "")[:120]
		self.votes = 0
		self.voters = ""

	def validate(self):
		super().validate()
		if self.type == "Milestone rating" and self.rating and not 1 <= self.rating <= 5:
			frappe.throw(_("A milestone rating is from 1 to 5."))
		if self.type == "Recommend" and self.rating is not None and not 0 <= self.rating <= 10:
			frappe.throw(_("Recommend is from 0 to 10."))
		if not staff() and not self.is_new():
			for field in ("status", "answer", "votes", "voters"):
				if self.has_value_changed(field):
					frappe.throw(_("Only the team can change that."), frappe.PermissionError)

	def after_insert(self):
		from frappe_live.raven import post_to_raven

		if not staff():
			who = frappe.db.get_value("User", self.from_user, "full_name") or self.from_user
			post_to_raven(self.project, f"**{self.type}** from {who}: {self.summary}", tag=f"LF-{self.name}")


class LiveMessage(_LiveDoc):
	def before_insert(self):
		self.from_user = frappe.session.user if not self.flags.from_raven else self.from_user
		if not self.direction:
			self.direction = "To customer" if staff(self.from_user) else "To team"

	def after_insert(self):
		from frappe_live.raven import notify_customer, post_to_raven

		if self.direction == "To team":
			who = frappe.db.get_value("User", self.from_user, "full_name") or self.from_user
			status = post_to_raven(self.project, f"{who}: {self.text}", tag=f"LM-{self.name}")
			self.db_set("raven_status", status)
		else:
			notify_customer(self)


class LiveMRR(_LiveDoc):
	def validate(self):
		super().validate()
		if not staff():
			frappe.throw(_("Only the team records MRR."), frappe.PermissionError)
		self.month = get_first_day(getdate(self.month))
		if self.mrr_usd < 0:
			frappe.throw(_("MRR can't be negative."))
		if self.change == "Churn":
			self.mrr_usd = 0

	def on_update(self):
		_refresh_onboarding_money(self.project)

	def on_trash(self):
		_refresh_onboarding_money(self.project, skip=self.name)


class LiveSession(_LiveDoc):
	def validate(self):
		super().validate()
		if not staff():
			frappe.throw(_("Only the team logs sessions."), frappe.PermissionError)
		if not self.run_by:
			self.run_by = frappe.session.user

	def on_update(self):
		_refresh_minutes(self.project)

	def on_trash(self):
		_refresh_minutes(self.project, skip=self.name)


class LiveCheck(_LiveDoc):
	def validate(self):
		super().validate()
		if not staff():
			frappe.throw(_("Only the team or a skill records checks."), frappe.PermissionError)


def _refresh_onboarding_money(project: str, skip: str | None = None):
	if not project or not frappe.db.exists("Live Onboarding", project):
		return
	filters = {"project": project}
	if skip:
		filters["name"] = ["!=", skip]
	rows = frappe.get_all("Live MRR", filters=filters, fields=["month", "mrr_usd", "change"], order_by="month asc")
	latest = rows[-1] if rows else None
	paid = next((r.month for r in rows if (r.mrr_usd or 0) > 0), None)
	frappe.db.set_value(
		"Live Onboarding",
		project,
		{"mrr_usd": latest.mrr_usd if latest else 0, "paid_since": paid},
		update_modified=False,
	)


def _refresh_minutes(project: str, skip: str | None = None):
	if not project or not frappe.db.exists("Live Onboarding", project):
		return
	filters = {"project": project}
	if skip:
		filters["name"] = ["!=", skip]
	total = sum(r.minutes or 0 for r in frappe.get_all("Live Session", filters=filters, fields=["minutes"]))
	frappe.db.set_value("Live Onboarding", project, "minutes_total", total, update_modified=False)
