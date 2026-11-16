# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Data for the in-app views: Reports (team) and Messages (everyone).
The /live app calls these; the old /live-reports and /live-help pages redirect into the app."""

from statistics import median

import frappe
from frappe import _
from frappe.utils import add_months, date_diff, get_first_day, getdate, nowdate

from frappe_live import api
from frappe_live.access import level
from frappe_live.live_docs import can_see_project, staff
from frappe_live.portal import MILESTONES, my_projects, project_thread

STAGES = ("Yet to start", *MILESTONES, "Paused", "Churned")


def _need_staff():
	if not staff():
		frappe.throw(_("Only the Frappe team can see this."), frappe.PermissionError)


def _names(users) -> dict:
	users = {u for u in users if u}
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ("in", list(users))}, fields=["name", "full_name"])
	return {r.name: r.full_name or r.name for r in rows}


def monthly_mrr(rows, onboardings):
	"""MRR per month: each onboarding's latest recorded value carried forward"""
	if not rows:
		return []
	start = min(getdate(r.month) for r in rows)
	end = get_first_day(nowdate())
	by_project = {}
	for r in sorted(rows, key=lambda r: r.month):
		by_project.setdefault(r.project, []).append(r)
	months = []
	m = get_first_day(start)
	while m <= end:
		total, by_owner = 0.0, {}
		for project, changes in by_project.items():
			current = [c for c in changes if getdate(c.month) <= m]
			if current:
				value = float(current[-1].mrr_usd or 0)
				total += value
				owner = onboardings.get(project, {}).get("owner_user") or "?"
				by_owner[owner] = by_owner.get(owner, 0) + value
		months.append({"month": str(m)[:7], "mrr": round(total, 2), "by_owner": by_owner})
		m = get_first_day(add_months(m, 1))
	return months


@frappe.whitelist()
def reports() -> dict:
	"""The team's numbers. Only records count: nothing here is estimated."""
	_need_staff()
	frappe.get_attr("frappe_live.health.update_all")()
	obs = frappe.get_all(
		"Live Onboarding",
		fields=["project", "customer", "app", "owner_user", "status", "health", "mrr_usd", "kickoff_date", "live_date", "minutes_total", "crm_deal"],
		order_by="kickoff_date desc, customer asc",
	)
	onboardings = {o.project: o for o in obs}
	names = _names(o.owner_user for o in obs)
	progress = {p["id"]: p for p in my_projects()}
	for o in obs:
		o.owner_name = names.get(o.owner_user, o.owner_user or "")
		o.days = date_diff(o.live_date or nowdate(), o.kickoff_date) if o.kickoff_date else None
		ms = (progress.get(o.project) or {}).get("milestones") or []
		o.steps_done = sum(m["done"] for m in ms)
		o.steps_total = sum(m["total"] for m in ms)
	funnel = [{"stage": s, "count": sum(1 for o in obs if o.status == s)} for s in STAGES]
	active = [o for o in obs if o.status not in ("Yet to start", "Churned", "Paused")]
	health = {h: sum(1 for o in active if o.health == h) for h in ("On track", "At risk", "Off track")}
	live_days = [date_diff(o.live_date, o.kickoff_date) for o in obs if o.live_date and o.kickoff_date]
	mrr_rows = frappe.get_all("Live MRR", fields=["project", "month", "mrr_usd", "change"])
	months = monthly_mrr(mrr_rows, onboardings)
	for m in months:
		m["by_owner"] = {names.get(k, k): v for k, v in m["by_owner"].items()}
	by_owner = {}
	for o in obs:
		row = by_owner.setdefault(o.owner_name or "Unassigned", {"owner": o.owner_name or "Unassigned", "count": 0, "live": 0, "mrr": 0.0})
		row["count"] += 1
		row["live"] += 1 if o.status in ("Live at day 30", "Live at day 90") else 0
		row["mrr"] += float(o.mrr_usd or 0)
	fb = frappe.get_all(
		"Live Feedback", fields=["name", "type", "rating", "status", "summary", "project", "votes", "creation"], order_by="creation desc", limit=50
	)
	ratings = [f.rating for f in fb if f.type != "Recommend" and f.rating]
	recommend = [f.rating for f in fb if f.type == "Recommend" and f.rating is not None]
	customers = {o.project: o.customer for o in obs}
	for f in fb:
		f.customer = customers.get(f.project, f.project)
	return {
		"onboardings": obs,
		"total": len(obs),
		"funnel": funnel,
		"health": health,
		"live_count": len(live_days),
		"median_days_to_live": median(live_days) if live_days else None,
		"months": months,
		# today's MRR = what each onboarding records now (kept in step with Live MRR rows), so tile and table agree
		"mrr_now": round(sum(float(o.mrr_usd or 0) for o in obs if o.status != "Churned"), 2),
		"paying": sum(1 for o in obs if (o.mrr_usd or 0) > 0),
		"by_owner": sorted(by_owner.values(), key=lambda r: -r["count"]),
		"feedback": fb[:20],
		"feedback_open": sum(1 for f in fb if f.status == "Open"),
		"avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
		"recommend": round(sum(recommend) / len(recommend), 1) if recommend else None,
		"minutes_total": sum(o.minutes_total or 0 for o in obs),
		"level": level(),
	}


@frappe.whitelist()
def inbox() -> dict:
	"""Messages: one row per project this person can see, newest conversation first.
	Customers get their own projects; the team gets every onboarding."""
	is_staff = staff()
	projects = my_projects()
	obs = {o.project: o for o in frappe.get_all("Live Onboarding", fields=["project", "customer", "app", "owner_user", "status", "health"])}
	ids = [p["id"] for p in projects]
	last = {}
	if ids:
		for m in frappe.get_all(
			"Live Message", filters={"project": ("in", ids)}, fields=["project", "text", "direction", "from_user", "creation"], order_by="creation asc"
		):
			last[m.project] = m
	open_fb = {}
	if ids:
		for f in frappe.get_all("Live Feedback", filters={"project": ("in", ids), "status": "Open"}, fields=["project"]):
			open_fb[f.project] = open_fb.get(f.project, 0) + 1
	names = _names([o.owner_user for o in obs.values()] + [m.from_user for m in last.values()])
	rows = []
	for p in projects:
		o = obs.get(p["id"])
		if not o and is_staff:
			continue  # team-only projects that are not onboardings stay out of Messages
		m = last.get(p["id"])
		rows.append(
			{
				"project": p["id"],
				"name": (o.customer if o else p["name"]),
				"app": o.app if o else "",
				"owner": names.get(o.owner_user, "") if o else "",
				"stage": o.status if o else "",
				"health": o.health if o else "",
				"milestones": p["milestones"],
				"open_tasks": p["open_tasks"],
				"last_text": (m.text[:140] if m else ""),
				"last_from": (names.get(m.from_user, m.from_user) if m else ""),
				"last_direction": (m.direction if m else ""),
				"last_at": (str(m.creation) if m else ""),
				"waiting": bool(m and m.direction == "To team"),
				"open_feedback": open_fb.get(p["id"], 0),
			}
		)
	waiting = [r for r in rows if r["waiting"]]
	rest = sorted([r for r in rows if not r["waiting"]], key=lambda r: r["last_at"], reverse=True)
	s = frappe.get_cached_doc("Live Settings")
	return {
		"staff": is_staff,
		"rows": sorted(waiting, key=lambda r: r["last_at"], reverse=True) + rest,
		"waiting": len(waiting),
		"office_hours": {
			"text": s.office_hours_text or "Every Friday, 4 to 6 pm IST, on Frappe Meet",
			"link": s.office_hours_link or "",
			"booking": s.booking_link or "",
		},
	}


@frappe.whitelist()
def conversation(project: str) -> dict:
	"""One project's messages and feedback, plus its plan, for the Messages view"""
	data = project_thread(project)
	p = next((x for x in my_projects() if x["id"] == project), None)
	o = frappe.db.get_value("Live Onboarding", project, ["customer", "app", "status", "health", "owner_user", "kickoff_date"], as_dict=True)
	if o:
		o.owner_name = _names([o.owner_user]).get(o.owner_user, o.owner_user or "")
	data.update({"project": p, "onboarding": o, "me": frappe.session.user, "staff": staff()})
	return data


@frappe.whitelist(methods=["POST"])
def answer_feedback(name: str, answer: str = "", status: str = "Answered") -> str:
	"""The team answers or closes a piece of feedback"""
	_need_staff()
	doc = frappe.get_doc("Live Feedback", name)
	if not can_see_project(doc.project):
		frappe.throw(_("You can't see this project."), frappe.PermissionError)
	if status not in ("Open", "Answered", "Closed"):
		frappe.throw(_("Unknown status."))
	doc.answer = (answer or doc.answer or "").strip()
	doc.status = status
	doc.save(ignore_permissions=True)
	return doc.status


@frappe.whitelist()
def waiting() -> int:
	"""How many conversations wait for a team reply (team), or have a team reply unseen (customers: 0 for now)"""
	if frappe.session.user == "Guest" or not staff():
		return 0
	last = {}
	for m in frappe.get_all("Live Message", fields=["project", "direction"], order_by="creation asc"):
		last[m.project] = m.direction
	return sum(1 for d in last.values() if d == "To team")
