# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Onboardings without a kickoff (payment) date had milestone dates from the day the project was made,
and reminders fired for them. Clear those dates, then work out every onboarding's stage and health
again with the live check."""

import frappe

from frappe_live import api


def execute():
	for name in frappe.get_all("Live Onboarding", filters={"kickoff_date": ("is", "not set")}, pluck="name"):
		proj = api._get("projects", name)
		if not proj:
			continue
		for m in proj.get("milestones") or []:
			m["due"] = None
		proj["start"] = None
		proj["target"] = None
		api.upsert("projects", proj)
	from frappe_live.health import update_all

	update_all()
