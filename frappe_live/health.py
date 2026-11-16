# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Where each onboarding stands, worked out from its tasks every day (and on demand).

Stage: the first of the five milestones that still has an open task. When every milestone is
done, the last one. "Yet to start" until there is a kickoff (payment) date.

Health:
- Off track: a Set up task is overdue by more than 7 days, or nothing happened for 14 days.
- At risk: any task overdue, or nothing happened for 7 days.
- On track: otherwise.
"""

import frappe
from frappe.utils import date_diff, getdate, nowdate

from frappe_live import api
from frappe_live.portal import MILESTONES


def _last_activity(project: str, tasks: list[dict]) -> str | None:
	stamps = [frappe.db.get_value("Live Task", t["id"], "modified") for t in tasks]
	for doctype in ("Live Message", "Live Feedback", "Live Session"):
		stamps += frappe.get_all(doctype, filters={"project": project}, pluck="modified", limit=1, order_by="modified desc")
	stamps = [s for s in stamps if s]
	return str(max(stamps))[:10] if stamps else None


def evaluate(project: dict, tasks: list[dict], since: str | None = None) -> dict:
	today = getdate(nowdate())
	ms = {m["id"]: m["name"] for m in project.get("milestones") or []}
	live = [t for t in tasks if not t.get("deletedAt")]
	stage = None
	for name in MILESTONES:
		mid = next((k for k, v in ms.items() if v == name), None)
		open_ = [t for t in live if t.get("milestone") == mid and t.get("status") != "done"]
		if open_:
			stage = name
			break
	if stage is None:
		stage = MILESTONES[-1] if live else "Set up"
	overdue = [t for t in live if t.get("status") != "done" and t.get("due") and getdate(str(t["due"])[:10]) < today]
	setup_id = next((k for k, v in ms.items() if v == "Set up"), None)
	late_setup = [t for t in overdue if t.get("milestone") == setup_id and date_diff(today, str(t["due"])[:10]) > 7]
	last = _last_activity(project["id"], live) or since
	idle = date_diff(today, last) if last else 999
	if late_setup or idle > 14:
		health = "Off track"
	elif overdue or idle > 7:
		health = "At risk"
	else:
		health = "On track"
	return {"status": stage, "health": health, "last_activity": last, "overdue": len(overdue)}


def update_all():
	projects = {p["id"]: p for p in api._all("projects")}
	tasks = api._all("tasks")
	for name, kickoff, status in frappe.get_all("Live Onboarding", fields=["name", "kickoff_date", "status"], as_list=True):
		p = projects.get(name)
		if not p or status in ("Paused", "Churned"):
			continue
		r = evaluate(p, [t for t in tasks if t.get("space") == name], str(kickoff) if kickoff else p.get("start"))
		values = {"health": r["health"], "status": r["status"] if kickoff else "Yet to start"}
		frappe.db.set_value("Live Onboarding", name, values, update_modified=False)
	frappe.db.commit()


@frappe.whitelist()
def refresh():
	from frappe_live.live_docs import staff

	if not staff():
		frappe.throw("Only the team can refresh.", frappe.PermissionError)
	update_all()
	return True
