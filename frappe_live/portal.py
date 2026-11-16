# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Whitelisted calls for the help page, the team, and skills (Claude over MCP today, Flow later).

Customers: my_projects, project_thread, send_feedback, vote, send_message.
Team: start_onboarding, add_steps, record_check, log_session, record_mrr.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate

from frappe_live import api
from frappe_live.access import level
from frappe_live.live_docs import can_see_project, staff, visible_projects

MILESTONES = ("Set up", "Start using", "Habit", "Live at day 30", "Live at day 90")


def _need_staff():
	if not staff():
		frappe.throw(_("Only the Frappe team can do this."), frappe.PermissionError)


def _need_project(project: str):
	if not project or not frappe.db.exists("Live Project", project):
		frappe.throw(_("No such project."))
	if not can_see_project(project):
		frappe.throw(_("You can't see this project."), frappe.PermissionError)


def weekday(d) -> str:
	"""Frappe Live rule: no due date on a Saturday or Sunday"""
	d = getdate(d)
	while d.weekday() >= 5:
		d = add_days(d, 1)
	return str(d)


# customers and team


@frappe.whitelist()
def my_projects() -> list[dict]:
	"""The projects this person may see, with milestone progress"""
	if frappe.session.user == "Guest":
		return []
	vis = visible_projects()
	out = []
	tasks = api._all("tasks")
	for p in api._all("projects"):
		if vis is not None and p.get("id") not in vis:
			continue
		if str(p.get("ws") or "").startswith("me-"):
			continue
		ptasks = [t for t in tasks if t.get("space") == p.get("id") and not t.get("deletedAt")]
		ms = []
		for m in p.get("milestones") or []:
			mt = [t for t in ptasks if t.get("milestone") == m.get("id")]
			ms.append({"id": m.get("id"), "name": m.get("name"), "due": m.get("due"), "done": sum(1 for t in mt if t.get("status") == "done"), "total": len(mt)})
		out.append(
			{
				"id": p.get("id"),
				"name": p.get("name"),
				"status": p.get("status"),
				"milestones": ms,
				"open_tasks": sum(1 for t in ptasks if t.get("status") != "done"),
			}
		)
	return sorted(out, key=lambda x: x["name"] or "")


@frappe.whitelist()
def project_thread(project: str) -> dict:
	_need_project(project)
	msgs = frappe.get_all(
		"Live Message", filters={"project": project}, fields=["name", "from_user", "direction", "text", "creation"], order_by="creation asc"
	)
	fb = frappe.get_all(
		"Live Feedback",
		filters={"project": project},
		fields=["name", "type", "summary", "details", "rating", "status", "answer", "votes", "from_user", "creation"],
		order_by="creation desc",
	)
	names = {u: frappe.db.get_value("User", u, "full_name") or u for u in {m.from_user for m in msgs} | {f.from_user for f in fb} if u}
	for row in msgs + fb:
		row["from_name"] = names.get(row.from_user, row.from_user)
	return {"messages": msgs, "feedback": fb}


@frappe.whitelist(methods=["POST"])
def send_feedback(project: str, type: str, details: str = "", rating: int | None = None, milestone: str = "", consent_to_quote: int = 0) -> str:
	_need_project(project)
	doc = frappe.get_doc(
		{
			"doctype": "Live Feedback",
			"project": project,
			"type": type,
			"details": details,
			"summary": (details or type)[:120],
			"rating": rating,
			"milestone": milestone,
			"consent_to_quote": 1 if int(consent_to_quote or 0) else 0,
		}
	)
	doc.insert()
	return doc.name


@frappe.whitelist(methods=["POST"])
def vote(feedback: str) -> int:
	"""One vote per person, on a question for Office Hours or any feedback they can see"""
	doc = frappe.get_doc("Live Feedback", feedback)
	_need_project(doc.project)
	voters = set(filter(None, (doc.voters or "").splitlines()))
	voters ^= {frappe.session.user}
	frappe.db.set_value("Live Feedback", feedback, {"voters": "\n".join(sorted(voters)), "votes": len(voters)}, update_modified=False)
	return len(voters)


@frappe.whitelist(methods=["POST"])
def send_message(project: str, text: str) -> str:
	_need_project(project)
	text = (text or "").strip()
	if not text:
		frappe.throw(_("Write a message first."))
	doc = frappe.get_doc({"doctype": "Live Message", "project": project, "text": text[:5000]})
	doc.insert()
	return doc.name


@frappe.whitelist()
def office_hours_questions() -> list[dict]:
	"""Open Office Hours questions this person can see, most votes first"""
	filters = {"type": "Office Hours question", "status": "Open"}
	return frappe.get_list(
		"Live Feedback", filters=filters, fields=["name", "project", "summary", "votes"], order_by="votes desc, creation asc", limit=50
	)


# team and skills


def _slug(text: str) -> str:
	s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
	return s[:40] or "onboarding"


def _person_for(email: str, full_name: str | None = None, invite: bool = False) -> str:
	"""The person id for an email, making the user and the person when needed"""
	email = email.strip().lower()
	people = api._all("people")
	found = next((p for p in people if (p.get("email") or "").lower() == email or p.get("user") == email), None)
	if found:
		return found["id"]
	if not frappe.db.exists("User", email):
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": (full_name or email.split("@")[0]).split(" ")[0],
				"last_name": " ".join((full_name or "").split(" ")[1:]) or None,
				"user_type": "Website User",
				"send_welcome_email": 1 if invite else 0,
			}
		)
		user.insert(ignore_permissions=True)
	base = re.sub(r"[^a-z0-9]", "", email.split("@")[0]) or "user"
	pid, n = base, 1
	ids = {p.get("id") for p in people}
	while pid in ids:
		n += 1
		pid = f"{base}{n}"
	api.upsert(
		"people",
		{"id": pid, "name": full_name or email.split("@")[0].title(), "email": email, "user": email, "role": "", "isAdmin": False, "canCreateProjects": level(email) in ("super", "admin"), "onboarded": True},
	)
	return pid


@frappe.whitelist(methods=["POST"])
def start_onboarding(
	customer: str,
	app: str,
	kickoff_date: str | None = None,
	customer_email: str | None = None,
	customer_name: str | None = None,
	invite: int = 0,
	crm_deal: str | None = None,
	site_url: str | None = None,
	live_condition: str | None = None,
	main_pain: str | None = None,
	used_before: str | None = None,
	team_size: int | None = None,
	plan: str | None = None,
	owner_user: str | None = None,
) -> str:
	"""A new assisted onboarding: a project with the five milestones, its Live Onboarding record,
	and the customer as a member. Nothing is emailed unless `invite` is set."""
	_need_staff()
	start = getdate(kickoff_date or nowdate())
	pid = _slug(f"{customer}-{app}")
	n = 1
	while frappe.db.exists("Live Project", pid):
		n += 1
		pid = f"{_slug(f'{customer}-{app}')}-{n}"
	me = api.find_me(api._all("people"))
	if not me:
		api.get_boot()
		me = api.find_me(api._all("people"))
	members = [{"user": me["id"], "role": "Owner"}]
	if customer_email:
		members.append({"user": _person_for(customer_email, customer_name, bool(int(invite or 0))), "role": "Member"})
	offsets = (7, 14, 21, 30, 90)
	milestones = [{"id": f"{pid}-m{i + 1}", "name": name, "due": weekday(add_days(start, offsets[i]))} for i, name in enumerate(MILESTONES)]
	code = re.sub(r"[^A-Z]", "", customer.upper())[:3] or "LIV"
	api.upsert(
		"projects",
		{
			"id": pid,
			"name": f"{customer}: {app}",
			"code": code,
			"description": f"Assisted Onboarding for {customer} on {app}",
			"status": "active",
			"priority": "p2",
			"start": str(start),
			"target": milestones[-1]["due"],
			"ws": api.COMPANY_WS,
			"milestones": milestones,
			"members": members,
		},
	)
	frappe.get_doc(
		{
			"doctype": "Live Onboarding",
			"project": pid,
			"customer": customer,
			"app": app if app in ("CRM", "ERPNext", "Frappe HR", "Helpdesk", "Learning") else "Other",
			"owner_user": owner_user if owner_user and level() == "super" else frappe.session.user,
			"status": "Yet to start" if not kickoff_date else "Set up",
			"kickoff_date": kickoff_date,
			"crm_deal": crm_deal,
			"site_url": site_url,
			"live_condition": live_condition,
			"main_pain": main_pain,
			"used_before": used_before,
			"team_size": team_size,
			"plan": plan,
		}
	).insert()
	return pid


@frappe.whitelist(methods=["POST"])
def add_steps(project: str, steps: str | list) -> list[str]:
	"""Write roadmap steps as tasks. Each step: title, milestone (one of the five names), why,
	done_when, owner ("team" or "customer"), due, block, new_block (bool). Used by the
	frappe-live skill after a first call or a session."""
	_need_staff()
	_need_project(project)
	steps = frappe.parse_json(steps) if isinstance(steps, str) else steps
	proj = frappe.parse_json(frappe.db.get_value("Live Project", project, "data"))
	by_name = {m["name"].lower(): m["id"] for m in proj.get("milestones") or []}
	members = proj.get("members") or []
	owner = next((m["user"] for m in members if m.get("role") == "Owner"), None)
	customer = next((m["user"] for m in members if m.get("role") != "Owner"), None)
	existing = [t for t in api._all("tasks") if t.get("space") == project]
	n = len(existing)
	ids = []
	me = api.find_me(api._all("people"))
	for s in steps:
		n += 1
		tid = f"{proj.get('code') or 'LIV'}-{n}"
		while frappe.db.exists("Live Task", tid):
			n += 1
			tid = f"{proj.get('code') or 'LIV'}-{n}"
		who = customer if (s.get("owner") or "").lower() == "customer" and customer else owner
		desc = []
		if s.get("why"):
			desc.append(f"<p><b>Why:</b> {frappe.utils.escape_html(s['why'])}</p>")
		if s.get("done_when"):
			desc.append(f"<p><b>Done when:</b> {frappe.utils.escape_html(s['done_when'])}</p>")
		labels = [x for x in (s.get("block"), "new block" if s.get("new_block") else None) if x]
		api.upsert(
			"tasks",
			{
				"id": tid,
				"title": s["title"],
				"space": project,
				"milestone": by_name.get((s.get("milestone") or "").lower()),
				"description": "".join(desc),
				"priority": s.get("priority") or "p3",
				"due": weekday(s["due"]) if s.get("due") else None,
				"labels": labels,
				"createdBy": me["id"] if me else owner,
				"assignee": who,
				"assignedBy": me["id"] if me else owner,
				"why": s.get("why"),
				"doneWhen": s.get("done_when"),
			},
		)
		ids.append(tid)
	return ids


@frappe.whitelist(methods=["POST"])
def record_check(project: str, task: str, passed: int, evidence: str = "", source: str = "Claude over MCP") -> str:
	"""Store a done-when check result; a pass marks the task done"""
	_need_staff()
	_need_project(project)
	doc = frappe.get_doc({"doctype": "Live Check", "project": project, "task": task, "passed": 1 if int(passed) else 0, "evidence": evidence, "source": source}).insert()
	if int(passed) and frappe.db.exists("Live Task", task):
		t = frappe.parse_json(frappe.db.get_value("Live Task", task, "data"))
		if t.get("status") != "done":
			t["status"] = "done"
			t["doneAt"] = frappe.utils.now_datetime().isoformat()
			t.setdefault("activity", []).append({"actor": None, "text": f"check passed: {evidence[:140]}", "at": t["doneAt"]})
			api.upsert("tasks", t)
	return doc.name


@frappe.whitelist(methods=["POST"])
def log_session(project: str, date: str, kind: str, minutes: int, notes: str = "", **kwargs) -> str:
	_need_staff()
	_need_project(project)
	fields = {k: v for k, v in kwargs.items() if k in ("steps_hit", "blockers", "roadmap_changes", "skill_changes", "product_issues")}
	return frappe.get_doc({"doctype": "Live Session", "project": project, "date": date, "kind": kind, "minutes": minutes, "notes": notes, **fields}).insert().name


@frappe.whitelist(methods=["POST"])
def record_mrr(project: str, month: str, mrr_usd: float, change: str = "New", plan: str = "", churn_reason: str = "") -> str:
	_need_staff()
	_need_project(project)
	return frappe.get_doc(
		{"doctype": "Live MRR", "project": project, "month": month, "mrr_usd": mrr_usd, "change": change, "plan": plan, "churn_reason": churn_reason}
	).insert().name


@frappe.whitelist(methods=["POST"])
def import_onboardings(rows: str | list) -> dict:
	"""Bring in onboardings from a list (for example the CRM Assisted Onboarding view). Super admin.
	Each row: customer, app, crm_deal, owner_user, customer_email, customer_name, kickoff_date.
	Skips a row whose CRM deal is already in. Never emails anyone."""
	if level() != "super":
		frappe.throw(_("Only a super admin can import."), frappe.PermissionError)
	rows = frappe.parse_json(rows) if isinstance(rows, str) else rows
	made, skipped = [], []
	for r in rows:
		if r.get("crm_deal") and frappe.db.exists("Live Onboarding", {"crm_deal": r["crm_deal"]}):
			skipped.append(r["crm_deal"])
			continue
		owner = r.get("owner_user")
		if owner:
			from frappe_live.access import assign_roles

			_person_for(owner)
			assign_roles(owner)
		pid = start_onboarding(
			customer=r["customer"],
			app=r.get("app") or "Other",
			kickoff_date=r.get("kickoff_date"),
			customer_email=r.get("customer_email"),
			customer_name=r.get("customer_name"),
			invite=0,
			crm_deal=r.get("crm_deal"),
			owner_user=owner,
		)
		if owner:
			oid = _person_for(owner)
			proj = api._get("projects", pid)
			if not any(m.get("user") == oid for m in proj["members"]):
				for m in proj["members"]:
					if m.get("role") == "Owner":
						m["role"] = "Member"
				proj["members"].insert(0, {"user": oid, "role": "Owner"})
				api.upsert("projects", proj)
		made.append(pid)
	return {"made": made, "skipped": skipped}
