# Copyright (c) 2026, Mauli Mogal and contributors
# For license information, please see license.txt

"""Whitelisted calls for customers, the team, and skills (Claude over MCP today, Flow later).

Customers: my_projects, project_thread, send_feedback, vote, send_message, step_done.
Team: start_onboarding, set_kickoff, update_onboarding, add_steps, record_check, record_live, log_session,
record_mrr, invite_customer.
"""

import re

import frappe
from frappe import _
from frappe.utils import add_days, getdate

from frappe_live import api
from frappe_live.access import level
from frappe_live.live_docs import can_see_project, staff, visible_projects

MILESTONES = ("Set up", "Start using", "Habit", "Live at day 30", "Live at day 90")
# days from kickoff to each milestone's date
MILESTONE_DAYS = (7, 14, 21, 30, 90)
# the step a paid invoice ticks (older steps have no `check`, so their title is read)
PAID_STEP = re.compile(r"paid plan", re.I)


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


def milestone_due(kickoff, i: int) -> str:
	return weekday(add_days(getdate(kickoff), MILESTONE_DAYS[i]))


def _customers(proj: dict) -> list[str]:
	"""Person ids of the customers on a project (members who are not Frappe staff)"""
	people = {p.get("id"): p for p in api._all("people")}
	out = []
	for m in proj.get("members") or []:
		person = people.get(m.get("user")) or {}
		user = person.get("user") or person.get("email")
		if user and frappe.db.exists("User", user) and level(user) == "user":
			out.append(m["user"])
	return out


def _health(project: str):
	from frappe_live.health import update_one

	update_one(project)


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
	return sorted(out, key=lambda x: (x["name"] or "").lower())


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
def send_feedback(
	project: str, type: str, details: str = "", rating: int | None = None, milestone: str = "", consent_to_quote: int = 0, task: str = ""
) -> str:
	_need_project(project)
	doc = frappe.get_doc(
		{
			"doctype": "Live Feedback",
			"project": project,
			"task": task or None,
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
		_join_team(found["id"], email)
		return found["id"]
	if not frappe.db.exists("User", email):
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": (full_name or email.split("@")[0].replace(".", " ").title()).split(" ")[0],
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
	_join_team(pid, email)
	return pid


def _join_team(pid: str, email: str):
	"""Staff (frappe.io, super admins) join the team workspace and land in it, like at first sign-in"""
	lvl = level(email) if frappe.db.exists("User", email) else "user"
	if lvl not in ("super", "admin") or not frappe.db.exists("Live Workspace", api.COMPANY_WS):
		return
	ws = frappe.parse_json(frappe.db.get_value("Live Workspace", api.COMPANY_WS, "data"))
	if not any(m.get("user") == pid for m in ws.get("members", [])):
		ws.setdefault("members", []).append({"user": pid, "role": "Admin" if lvl == "super" else "Member"})
		api.upsert("workspaces", ws)
	person = api._get("people", pid) or {}
	if person and (not person.get("canCreateProjects") or (lvl == "super" and not person.get("isAdmin"))):
		person.update({"canCreateProjects": True, "isAdmin": person.get("isAdmin") or lvl == "super"})
		api.upsert("people", person)
	if not frappe.db.exists("Live Map Entry", f"currentWsOf:{pid}"):
		api.set_map_key("currentWsOf", pid, api.COMPANY_WS)


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
	and the customer as a member. Milestones get dates only from a kickoff (payment) date.
	Nothing is emailed unless `invite` is set."""
	_need_staff()
	start = getdate(kickoff_date) if kickoff_date else None
	pid = _slug(f"{customer}-{app}")
	n = 1
	while frappe.db.exists("Live Project", pid):
		n += 1
		pid = f"{_slug(f'{customer}-{app}')}-{n}"
	me = api.find_me(api._all("people"))
	if not me:
		api.get_boot()
		me = api.find_me(api._all("people"))
	owner = owner_user if owner_user and level() == "super" else frappe.session.user
	if owner != frappe.session.user:
		from frappe_live.access import assign_roles

		_person_for(owner)
		assign_roles(owner)
		lead = _person_for(owner)
		members = [{"user": lead, "role": "Owner"}]
		if lead != me["id"]:
			members.append({"user": me["id"], "role": "Member"})
	else:
		members = [{"user": me["id"], "role": "Owner"}]
	if customer_email:
		members.append({"user": _person_for(customer_email, customer_name, bool(int(invite or 0))), "role": "Member"})
	milestones = [{"id": f"{pid}-m{i + 1}", "name": name, "due": milestone_due(start, i) if start else None} for i, name in enumerate(MILESTONES)]
	code = re.sub(r"[^A-Z]", "", customer.upper())[:3] or "LIV"
	api.upsert(
		"projects",
		{
			"id": pid,
			"name": f"{customer}: {app}",
			"code": code,
			"description": "",
			"status": "active",
			"start": str(start) if start else None,
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
			"app": app if app in APPS else "Other",
			"owner_user": owner,
			"status": "Set up" if start else "Yet to start",
			"kickoff_date": str(start) if start else None,
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


APPS = ("CRM", "ERPNext", "Frappe HR", "Helpdesk", "Learning")


@frappe.whitelist(methods=["POST"])
def set_kickoff(project: str, kickoff_date: str) -> dict:
	"""The customer paid: the kickoff date starts the clock. Dates the five milestones from it."""
	_need_staff()
	_need_project(project)
	start = getdate(kickoff_date)
	proj = api._get("projects", project)
	for i, m in enumerate(proj.get("milestones") or []):
		if m.get("name") in MILESTONES:
			m["due"] = milestone_due(start, MILESTONES.index(m["name"]))
	proj["start"] = str(start)
	proj["target"] = milestone_due(start, len(MILESTONES) - 1)
	api.upsert("projects", proj)
	if frappe.db.exists("Live Onboarding", project):
		frappe.db.set_value("Live Onboarding", project, "kickoff_date", str(start))
	_health(project)
	return {"kickoff_date": str(start), "milestones": proj["milestones"]}


ONBOARDING_FIELDS = ("customer", "app", "site_url", "crm_deal", "plan", "live_condition", "main_pain", "used_before", "team_size", "status")


@frappe.whitelist(methods=["POST"])
def update_onboarding(project: str, values: str | dict) -> dict:
	"""Change an onboarding's details from its project page. Status takes only Paused, Churned or back to active."""
	_need_staff()
	_need_project(project)
	values = frappe.parse_json(values) if isinstance(values, str) else values
	doc = frappe.get_doc("Live Onboarding", project)
	for field, value in (values or {}).items():
		if field not in ONBOARDING_FIELDS:
			continue
		if field == "status" and value not in ("Paused", "Churned", "Active"):
			continue
		if field == "app" and value not in (*APPS, "Other"):
			continue
		doc.set(field, None if value == "Active" and field == "status" else value)
	if doc.status in (None, "", "Active"):
		doc.status = "Yet to start" if not doc.kickoff_date else "Set up"
	doc.save()
	_health(project)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def add_steps(project: str, steps: str | list) -> list[str]:
	"""Write roadmap steps as tasks. Each step: title, milestone (one of the five names), why,
	done_when, owner ("team" or "customer"), due, block, new_block (bool), check ("paid" for the step a
	paid invoice ticks). A customer step goes to the customer on the project, or waits unassigned until
	one is invited. Used by the frappe-live skill after a first call or a session."""
	_need_staff()
	_need_project(project)
	steps = frappe.parse_json(steps) if isinstance(steps, str) else steps
	proj = frappe.parse_json(frappe.db.get_value("Live Project", project, "data"))
	by_name = {m["name"].lower(): m["id"] for m in proj.get("milestones") or []}
	members = proj.get("members") or []
	owner = next((m["user"] for m in members if m.get("role") == "Owner"), None)
	customer = next(iter(_customers(proj)), None)
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
		step_owner = "customer" if (s.get("owner") or "").lower() == "customer" else "team"
		desc = []
		if s.get("why"):
			desc.append(f"<p><b>Why:</b> {frappe.utils.escape_html(s['why'])}</p>")
		if s.get("done_when"):
			desc.append(f"<p><b>Done when:</b> {frappe.utils.escape_html(s['done_when'])}</p>")
		api.upsert(
			"tasks",
			{
				"id": tid,
				"title": s["title"],
				"space": project,
				"milestone": by_name.get((s.get("milestone") or "").lower()),
				"description": "".join(desc),
				"due": weekday(s["due"]) if s.get("due") else None,
				"labels": [],
				"owner": step_owner,
				"check": s.get("check") or ("paid" if PAID_STEP.search(s["title"]) else None),
				"block": s.get("block"),
				"newBlock": bool(s.get("new_block")),
				"createdBy": me["id"] if me else owner,
				"createdAt": frappe.utils.now_datetime().isoformat(),
				"assignee": customer if step_owner == "customer" else owner,
				"assignedBy": me["id"] if me else owner,
				"why": s.get("why"),
				"doneWhen": s.get("done_when"),
			},
		)
		ids.append(tid)
	_health(project)
	return ids


def _mark_done(task: dict, note: str):
	if task.get("status") == "done":
		return False
	task["status"] = "done"
	task["doneAt"] = frappe.utils.now_datetime().isoformat()
	task.setdefault("activity", []).append({"actor": None, "text": note[:140], "at": task["doneAt"]})
	api.upsert("tasks", task)
	return True


@frappe.whitelist(methods=["POST"])
def record_check(project: str, task: str, passed: int, evidence: str = "", source: str = "Claude over MCP") -> str:
	"""Store a done-when check result; a pass marks the task done"""
	_need_staff()
	_need_project(project)
	doc = frappe.get_doc({"doctype": "Live Check", "project": project, "task": task, "passed": 1 if int(passed) else 0, "evidence": evidence, "source": source}).insert()
	if int(passed) and frappe.db.exists("Live Task", task):
		_mark_done(api._get("tasks", task), f"check passed: {evidence}")
	_health(project)
	return doc.name


LIVE_PARTS = ("active", "condition")


@frappe.whitelist(methods=["POST"])
def record_live(project: str, part: str, passed: int, evidence: str = "", source: str = "Claude over MCP") -> str:
	"""One part of the live check, from site data: "active" (used in the last 7 days) or "condition"
	(the customer's own live condition holds). Paid comes from MRR records. Live = all three."""
	_need_staff()
	_need_project(project)
	if part not in LIVE_PARTS:
		frappe.throw(_("Part is active or condition."))
	doc = frappe.get_doc(
		{"doctype": "Live Check", "project": project, "task": f"live:{part}", "passed": 1 if int(passed) else 0, "evidence": evidence, "source": source}
	).insert()
	_health(project)
	return doc.name


@frappe.whitelist(methods=["POST"])
def step_done(project: str, task: str) -> bool:
	"""A customer marks one of their own steps done (the team can mark any). Kept as a check by hand."""
	_need_project(project)
	t = api._get("tasks", task)
	if not t or t.get("space") != project:
		frappe.throw(_("No such step."))
	if not staff():
		me = api.find_me(api._all("people"))
		if t.get("owner") != "customer" and t.get("assignee") != (me or {}).get("id"):
			frappe.throw(_("The Frappe team does this step."), frappe.PermissionError)
	who = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	changed = _mark_done(t, f"marked done by {who}")
	if changed:
		check = frappe.get_doc({"doctype": "Live Check", "project": project, "task": task, "passed": 1, "evidence": f"Marked done by {who}", "source": "By hand"})
		check.flags.from_step_done = True
		check.insert(ignore_permissions=True)
	_health(project)
	return changed


def tick_paid(project: str):
	"""A paid invoice is recorded: the paid-plan step is done"""
	for t in api._all("tasks"):
		if t.get("space") != project or t.get("deletedAt"):
			continue
		if t.get("check") == "paid" or (not t.get("check") and PAID_STEP.search(t.get("title") or "")):
			_mark_done(t, "paid invoice recorded")


@frappe.whitelist(methods=["POST"])
def log_session(project: str, date: str, kind: str, minutes: int, notes: str = "", **kwargs) -> str:
	_need_staff()
	_need_project(project)
	fields = {k: v for k, v in kwargs.items() if k in ("steps_hit", "blockers", "roadmap_changes", "skill_changes", "product_issues")}
	name = frappe.get_doc({"doctype": "Live Session", "project": project, "date": date, "kind": kind, "minutes": minutes, "notes": notes, **fields}).insert().name
	_health(project)
	return name


@frappe.whitelist(methods=["POST"])
def record_mrr(project: str, month: str, mrr_usd: float, change: str = "New", plan: str = "", churn_reason: str = "") -> str:
	_need_staff()
	_need_project(project)
	name = frappe.get_doc(
		{"doctype": "Live MRR", "project": project, "month": month, "mrr_usd": mrr_usd, "change": change, "plan": plan, "churn_reason": churn_reason}
	).insert().name
	_health(project)
	return name


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


@frappe.whitelist(methods=["POST"])
def invite_customer(project: str, email: str, full_name: str = "") -> dict:
	"""Add someone to one project by email, from the app's Invite dialog.
	A new person gets a login and Frappe's welcome email (set a password, or sign in with a link);
	someone who already has a login gets an email that they were added. They see only this project.
	Customer steps waiting for someone go to them."""
	_need_staff()
	_need_project(project)
	email = (email or "").strip().lower()
	if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
		frappe.throw(_("Enter a valid email."))
	is_new = not frappe.db.exists("User", email)
	pid = _person_for(email, full_name or None, invite=True)
	from frappe_live.access import assign_roles

	assign_roles(email)
	proj = api._get("projects", project)
	added = False
	if not any(m.get("user") == pid for m in proj.get("members", [])):
		proj.setdefault("members", []).append({"user": pid, "role": "Member"})
		api.upsert("projects", proj)
		added = True
	if level(email) == "user":
		for t in api._all("tasks"):
			if t.get("space") == project and t.get("owner") == "customer" and not t.get("assignee"):
				t["assignee"] = pid
				api.upsert("tasks", t)
	if not is_new and added:
		link = frappe.utils.get_url(f"/live/messages?p={project}")
		who = frappe.db.get_value("User", frappe.session.user, "full_name") or "The Frappe team"
		frappe.sendmail(
			recipients=[email],
			subject=_("You're on {0} in Frappe Live").format(proj.get("name")),
			message=_(
				"<p>{0} added you to <b>{1}</b> in Frappe Live.</p>"
				"<p>See your next step and message the team here: <a href='{2}'>{2}</a></p>"
			).format(frappe.utils.escape_html(who), frappe.utils.escape_html(proj.get("name") or ""), link),
			now=True,
		)
	return {"person": pid, "new_user": is_new, "added": added}
