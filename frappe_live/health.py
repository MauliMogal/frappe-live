# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Where each onboarding stands. The one place stage, health and live are worked out, daily and
whenever a step, check, session, message or MRR row changes.

Live is a record, not a stage name. A customer is live when all three hold:
- paid: their latest MRR row is above zero
- active: a passed "live:active" check (their site was used) in the last 7 days
- their own condition: the latest "live:condition" check passed
The first day all three hold is `live_date`. It is never moved after that.

Stage:
- "Yet to start" until there is a kickoff (payment) date.
- Not live: the first milestone that still has an open step, at most "Habit".
- Live: "Live at day 90" from day 90 after kickoff, "Live at day 30" from day 30, else "Habit".

Health:
- Off track: a Set up step overdue by more than 7 days, or nothing happened for 14 days,
  or they went live and are not live any more.
- At risk: any step overdue, or nothing happened for 7 days.
- On track: otherwise.
"""

import frappe
from frappe.utils import add_days, date_diff, getdate, nowdate

from frappe_live import api
from frappe_live.portal import MILESTONES

LIVE_STAGES = ("Live at day 30", "Live at day 90")


def _last_activity(project: str, tasks: list[dict]) -> str | None:
	stamps = [frappe.db.get_value("Live Task", t["id"], "modified") for t in tasks]
	for doctype in ("Live Message", "Live Feedback", "Live Session", "Live Check"):
		stamps += frappe.get_all(doctype, filters={"project": project}, pluck="modified", limit=1, order_by="modified desc")
	stamps = [s for s in stamps if s]
	return str(max(stamps))[:10] if stamps else None


def _latest_check(project: str, part: str) -> dict | None:
	rows = frappe.get_all(
		"Live Check", filters={"project": project, "task": f"live:{part}"}, fields=["passed", "creation", "evidence"], order_by="creation desc", limit=1
	)
	return rows[0] if rows else None


def live_parts(project: str, mrr_usd: float | None) -> dict:
	"""The three parts of live, each with whether it holds now"""
	today = getdate(nowdate())
	active = _latest_check(project, "active")
	condition = _latest_check(project, "condition")
	return {
		"paid": bool(mrr_usd and float(mrr_usd) > 0),
		"active": bool(active and active.passed and getdate(active.creation) >= add_days(today, -7)),
		"condition": bool(condition and condition.passed),
	}


def evaluate(project: dict, tasks: list[dict], kickoff: str | None, mrr_usd: float | None = 0, live_date: str | None = None) -> dict:
	today = getdate(nowdate())
	ms = {m["id"]: m["name"] for m in project.get("milestones") or []}
	steps = [t for t in tasks if not t.get("deletedAt")]
	parts = live_parts(project["id"], mrr_usd)
	live_now = all(parts.values())
	if live_now and not live_date:
		live_date = str(today)

	if not kickoff:
		stage = "Yet to start"
	elif live_now:
		days = date_diff(today, kickoff)
		stage = "Live at day 90" if days >= 90 else "Live at day 30" if days >= 30 else "Habit"
	else:
		stage = None
		for name in MILESTONES:
			if name in LIVE_STAGES:
				break
			mid = next((k for k, v in ms.items() if v == name), None)
			if any(t.get("milestone") == mid and t.get("status") != "done" for t in steps):
				stage = name
				break
		stage = stage or ("Habit" if steps else "Set up")

	overdue = [t for t in steps if t.get("status") != "done" and t.get("due") and getdate(str(t["due"])[:10]) < today]
	setup_id = next((k for k, v in ms.items() if v == "Set up"), None)
	late_setup = [t for t in overdue if t.get("milestone") == setup_id and date_diff(today, str(t["due"])[:10]) > 7]
	last = _last_activity(project["id"], steps) or kickoff
	idle = date_diff(today, last) if last else 999
	if late_setup or idle > 14 or (live_date and not live_now):
		health = "Off track"
	elif overdue or idle > 7:
		health = "At risk"
	else:
		health = "On track"
	return {
		"status": stage,
		"health": health,
		"last_activity": last,
		"overdue": len(overdue),
		"live_now": live_now,
		"live_parts": parts,
		"live_date": live_date,
	}


def _apply(o: dict, project: dict, tasks: list[dict]):
	if not project or o.status in ("Paused", "Churned"):
		return
	r = evaluate(project, tasks, str(o.kickoff_date) if o.kickoff_date else None, o.mrr_usd, str(o.live_date) if o.live_date else None)
	values = {"health": r["health"], "status": r["status"]}
	if r["live_date"] and not o.live_date:
		values["live_date"] = r["live_date"]
	frappe.db.set_value("Live Onboarding", o.name, values, update_modified=False)


FIELDS = ["name", "kickoff_date", "status", "mrr_usd", "live_date"]


def update_one(project: str):
	o = frappe.db.get_value("Live Onboarding", project, FIELDS, as_dict=True)
	if not o:
		return
	_apply(o, api._get("projects", project), [t for t in api._all("tasks") if t.get("space") == project])


def update_all():
	projects = {p["id"]: p for p in api._all("projects")}
	tasks = api._all("tasks")
	for o in frappe.get_all("Live Onboarding", fields=FIELDS):
		_apply(o, projects.get(o.name), [t for t in tasks if t.get("space") == o.name])
	frappe.db.commit()


@frappe.whitelist()
def refresh():
	from frappe_live.live_docs import staff

	if not staff():
		frappe.throw("Only the team can refresh.", frappe.PermissionError)
	update_all()
	return True
