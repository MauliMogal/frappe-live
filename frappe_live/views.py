# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Data for the in-app views: Reports (team) and Messages (everyone).
The /live app calls these; the old /live-reports and /live-help pages redirect into the app."""

from datetime import timedelta
from statistics import median

import frappe
from frappe import _
from frappe.utils import add_days, add_months, date_diff, get_datetime, get_first_day, getdate, now_datetime, nowdate

from frappe_live import api
from frappe_live.access import level
from frappe_live.live_docs import can_see_project, staff
from frappe_live.portal import MILESTONES, _customers, my_projects, project_thread

STAGES = ("Yet to start", *MILESTONES, "Paused", "Churned")


def _need_staff():
	if not staff():
		frappe.throw(_("Only the Frappe team can see this."), frappe.PermissionError)


def _names(users) -> dict:
	users = {u for u in users if u}
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ("in", list(users))}, fields=["name", "full_name"])
	out = {}
	for r in rows:
		name = (r.full_name or r.name.split("@")[0]).strip()
		out[r.name] = name.title() if name.islower() else name
	return out


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
	today = getdate(nowdate())

	def live_by(days: int) -> dict:
		"""Of the onboardings that kicked off at least `days` ago, how many were live by then"""
		eligible = [o for o in obs if o.kickoff_date and date_diff(today, o.kickoff_date) >= days]
		hit = [o for o in eligible if o.live_date and date_diff(o.live_date, o.kickoff_date) <= days]
		return {"live": len(hit), "of": len(eligible)}

	mrr_rows = frappe.get_all("Live MRR", fields=["project", "month", "mrr_usd", "change"])
	months = monthly_mrr(mrr_rows, onboardings)
	for m in months:
		m["by_owner"] = {names.get(k, k): v for k, v in m["by_owner"].items()}
	by_owner = {}
	for o in obs:
		row = by_owner.setdefault(o.owner_name or "Unassigned", {"owner": o.owner_name or "Unassigned", "count": 0, "live": 0, "mrr": 0.0})
		row["count"] += 1
		row["live"] += 1 if o.live_date else 0
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
		"live_by_30": live_by(30),
		"live_by_90": live_by(90),
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
		"started": sum(1 for o in obs if o.kickoff_date),
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
	return {
		"staff": is_staff,
		"rows": sorted(waiting, key=lambda r: r["last_at"], reverse=True) + rest,
		"waiting": len(waiting),
		"office_hours": _office_hours_settings(),
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
	steps = _steps(project)
	mine = [t for t in steps if t.get("owner") == "customer"]
	data["next_step"] = next((_step_out(t) for t in mine if t.get("status") != "done"), None)
	data["team_next"] = next((_step_out(t) for t in steps if t.get("owner") != "customer" and t.get("status") != "done"), None)
	data["customer_steps"] = {"done": sum(1 for t in mine if t.get("status") == "done"), "total": len(mine)}
	data["live_condition"] = frappe.db.get_value("Live Onboarding", project, "live_condition") if o else None
	data["customers"] = _customer_people(project)
	data["office_hours"] = _office_hours_settings()
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


# shared helpers


def _office_hours_settings() -> dict:
	s = frappe.get_cached_doc("Live Settings")
	return {
		"text": s.office_hours_text or "Fridays, 4 to 6 pm IST",
		"link": s.office_hours_link or "",
		"booking": s.booking_link or "",
	}


def _milestone_order(project: dict) -> dict:
	return {m["id"]: i for i, m in enumerate(project.get("milestones") or [])}


def _steps(project: str) -> list[dict]:
	"""A project's steps in roadmap order: milestone, then due date"""
	proj = api._get("projects", project) or {}
	order = _milestone_order(proj)
	steps = [t for t in api._all("tasks") if t.get("space") == project and not t.get("deletedAt")]
	return sorted(steps, key=lambda t: (order.get(t.get("milestone"), 99), str(t.get("due") or "9999"), t.get("createdAt") or ""))


def _step_out(t: dict) -> dict:
	return {"id": t["id"], "title": t.get("title"), "why": t.get("why"), "done_when": t.get("doneWhen"), "due": t.get("due"), "owner": t.get("owner") or "team"}


def _customer_people(project: str) -> list[dict]:
	proj = api._get("projects", project) or {}
	ids = set(_customers(proj))
	return [{"id": p["id"], "name": p.get("name"), "email": p.get("email") or p.get("user")} for p in api._all("people") if p.get("id") in ids]


# Inbox: what needs the team today


def _inbox_state(user: str) -> dict:
	rows = frappe.get_all("Live Map Entry", filters={"map_name": "inbox", "map_key": ("like", f"{user}|%")}, fields=["map_key", "value"])
	return {r.map_key.split("|", 1)[1]: frappe.parse_json(r.value) for r in rows}


@frappe.whitelist()
def needs_me(everyone: int = 0) -> dict:
	"""One list of what needs the team: customers waiting, onboardings slipping, steps that moved,
	paid customers with no roadmap, deals waiting to start, and your own steps due soon.
	Your onboardings by default; a super admin can ask for everyone's."""
	_need_staff()
	user = frappe.session.user
	all_of_them = bool(int(everyone or 0)) and level() == "super"
	obs = frappe.get_all(
		"Live Onboarding",
		fields=["project", "customer", "app", "owner_user", "status", "health", "kickoff_date", "creation"],
		filters={} if all_of_them else {"owner_user": user},
	)
	ids = [o.project for o in obs]
	by_id = {o.project: o for o in obs}
	projects = {p["id"]: p for p in api._all("projects") if p.get("id") in by_id}
	tasks = [t for t in api._all("tasks") if t.get("space") in by_id and not t.get("deletedAt")]
	me = api.find_me(api._all("people"))
	today = getdate(nowdate())
	rows = []

	def add(key, kind, project, title, text, at=None, urgent=False):
		rows.append({"key": key, "kind": kind, "project": project, "customer": by_id[project].customer if project in by_id else "", "title": title, "text": text, "at": str(at or ""), "urgent": urgent})

	if ids:
		last = {}
		for m in frappe.get_all("Live Message", filters={"project": ("in", ids)}, fields=["name", "project", "text", "direction", "creation"], order_by="creation asc"):
			last[m.project] = m
		for project, m in last.items():
			if m.direction == "To team":
				add(f"msg:{m.name}", "waiting", project, "Waiting for a reply", m.text[:160], m.creation, True)
		for f in frappe.get_all(
			"Live Feedback",
			filters={"project": ("in", ids), "status": "Open", "type": ("in", ("I'm stuck", "Bug"))},
			fields=["name", "project", "type", "summary", "task", "creation"],
		):
			step = next((t.get("title") for t in tasks if t["id"] == f.task), "")
			add(f"fb:{f.name}", "stuck", f.project, f"Stuck on {step}" if step else f.type, f.summary or "", f.creation, True)

	for project, o in by_id.items():
		steps = [t for t in tasks if t.get("space") == project]
		proj = projects.get(project) or {}
		if o.status in ("Paused", "Churned"):
			continue
		if not o.kickoff_date:
			if date_diff(today, getdate(o.creation)) >= 14:
				add(f"wait:{project}", "start", project, "Not started", f"Waiting {date_diff(today, getdate(o.creation))} days for kickoff", o.creation)
			continue
		if not steps and date_diff(today, o.kickoff_date) >= 2:
			add(f"noroad:{project}", "roadmap", project, "Paid, no roadmap", f"{date_diff(today, o.kickoff_date)} days since kickoff", o.kickoff_date, True)
		for m in proj.get("milestones") or []:
			if not m.get("due"):
				continue
			left = date_diff(m["due"], today)
			open_steps = [t for t in steps if t.get("milestone") == m["id"] and t.get("status") != "done"]
			if open_steps and left <= 3:
				when = "overdue" if left < 0 else "due today" if left == 0 else f"due in {left} days"
				add(f"slip:{project}:{m['id']}:{m['due']}", "slipping", project, f"{m['name']} {when}", f"{len(open_steps)} open steps", m["due"], left < 0)
				break
		if o.health in ("At risk", "Off track") and not any(r["project"] == project and r["kind"] in ("slipping", "roadmap") for r in rows):
			add(f"health:{project}:{o.health}:{today.isocalendar()[1]}", "slipping", project, o.health, "No activity lately or steps overdue", None)
		for t in steps:
			done_at = t.get("doneAt")
			if t.get("status") == "done" and done_at and get_datetime(done_at[:19].replace("T", " ")) >= now_datetime() - timedelta(hours=48):
				who = (t.get("activity") or [{}])[-1].get("text", "done")
				add(f"done:{t['id']}", "moved", project, t.get("title"), who, done_at)
			elif (
				me
				and t.get("status") != "done"
				and t.get("owner") != "customer"
				and t.get("assignee") == me["id"]
				and t.get("due")
				and date_diff(t["due"], today) <= 3
			):
				left = date_diff(t["due"], today)
				when = "overdue" if left < 0 else "due today" if left == 0 else f"due in {left} days"
				add(f"step:{t['id']}:{t['due']}", "step", project, t.get("title"), f"Your step, {when}", t["due"], left < 0)

	others = [o for o in obs if o.app == "Other"]
	if others:
		add(f"apps:{len(others)}", "apps", "", f"{len(others)} {'onboarding' if len(others) == 1 else 'onboardings'} without an app", "Set the app to start a roadmap", None)

	state = _inbox_state(user)
	shown, snoozed = [], 0
	for r in rows:
		st = state.get(r["key"]) or {}
		if st.get("done"):
			continue
		if st.get("until") and getdate(st["until"]) > today:
			snoozed += 1
			continue
		shown.append(r)
	order = {"waiting": 0, "stuck": 0, "roadmap": 1, "slipping": 2, "step": 3, "moved": 4, "start": 5, "apps": 6}
	shown.sort(key=lambda r: (not r["urgent"], order.get(r["kind"], 9), r["at"] or "9999"))
	return {"rows": shown, "snoozed": snoozed, "can_see_everyone": level() == "super", "everyone": all_of_them}


@frappe.whitelist(methods=["POST"])
def inbox_mark(key: str, action: str, until: str | None = None) -> bool:
	"""done: hide this row for good. snooze: hide until a date (tomorrow by default). undo: show it again."""
	_need_staff()
	if action not in ("done", "snooze", "undo"):
		frappe.throw(_("Unknown action."))
	value = None if action == "undo" else {"done": True} if action == "done" else {"until": str(getdate(until) if until else add_days(nowdate(), 1))}
	api.set_map_key("inbox", f"{frappe.session.user}|{key}", value)
	return True


# One onboarding, for its project page


@frappe.whitelist()
def project_card(project: str) -> dict:
	_need_staff()
	if not can_see_project(project):
		frappe.throw(_("You can't see this project."), frappe.PermissionError)
	from frappe_live.health import live_parts

	o = frappe.db.get_value("Live Onboarding", project, "*", as_dict=True)
	if not o:
		return {"onboarding": None}
	o.owner_name = _names([o.owner_user]).get(o.owner_user, o.owner_user or "")
	steps = _steps(project)
	sessions = frappe.get_all("Live Session", filters={"project": project}, fields=["name", "date", "kind", "minutes", "notes", "blockers", "run_by"], order_by="date desc, creation desc", limit=20)
	runners = _names([x.run_by for x in sessions])
	for x in sessions:
		x.run_by_name = runners.get(x.run_by, x.run_by or "")
	last_customer = frappe.get_all("Live Message", filters={"project": project, "direction": "To team"}, fields=["creation"], order_by="creation desc", limit=1)
	return {
		"onboarding": o,
		"live": live_parts(project, o.mrr_usd),
		"next_customer": next((_step_out(t) for t in steps if t.get("owner") == "customer" and t.get("status") != "done"), None),
		"next_team": next((_step_out(t) for t in steps if t.get("owner") != "customer" and t.get("status") != "done"), None),
		"steps": {"done": sum(1 for t in steps if t.get("status") == "done"), "total": len(steps)},
		"customers": _customer_people(project),
		"sessions": sessions,
		"last_customer_message": str(last_customer[0].creation) if last_customer else None,
		"apps": ["CRM", "ERPNext", "Frappe HR", "Helpdesk", "Learning", "Other"],
	}


# Office Hours, Fridays


@frappe.whitelist()
def office_hours() -> dict:
	"""This week's questions, most votes first, with who asked"""
	_need_staff()
	qs = frappe.get_all(
		"Live Feedback",
		filters={"type": "Office Hours question", "status": "Open"},
		fields=["name", "project", "summary", "details", "votes", "from_user", "creation"],
		order_by="votes desc, creation asc",
	)
	customers = {o.project: o.customer for o in frappe.get_all("Live Onboarding", fields=["project", "customer"])}
	names = _names([q.from_user for q in qs])
	for q in qs:
		q.customer = customers.get(q.project, q.project)
		q.from_name = names.get(q.from_user, q.from_user)
	return {"questions": qs, "settings": _office_hours_settings()}


@frappe.whitelist(methods=["POST"])
def log_office_hours(projects: str | list, minutes: int, notes: str = "") -> int:
	"""After Friday's call: an Office Hours session for each customer who came (the minutes shared), their questions answered"""
	_need_staff()
	from frappe_live.portal import log_session

	projects = frappe.parse_json(projects) if isinstance(projects, str) else projects
	day = nowdate()
	# the call's minutes are shared between the customers who came, so minutes per customer stay honest
	share = round(int(minutes or 0) / max(1, len(projects or [])))
	for project in projects or []:
		log_session(project, day, "Office Hours", share, notes)
		for name in frappe.get_all("Live Feedback", filters={"project": project, "type": "Office Hours question", "status": "Open"}, pluck="name"):
			frappe.db.set_value("Live Feedback", name, "status", "Answered")
	return len(projects or [])
