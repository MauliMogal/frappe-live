# Copyright (c) 2026, Mauli Mogal and contributors
# Based on Frappe Tasks by Swarali (MIT). For license information, please see license.txt

"""Server side of the Frappe Live Studio app (studio/live).

The browser keeps the app's store (src/lib/store.ts) in memory. This module loads it (`get_boot`,
the studio_app_boot hook), saves what changed (`save`), and tells other people's open tabs about
it over the socket (event `live_sync`).

Records keep the app's objects as they are, in each doc's `data` JSON, with a few columns copied
out so they read well in Desk. Every read and write is checked in `frappe_live.access`: a person
receives only the records they may see, and a write they may not make is refused whole.
"""

import frappe
from frappe import _
from frappe.utils import getdate

from frappe_live.access import Viewer

# store collection -> (DocType, key field in the record)
KINDS = {
	"people": ("Live Person", "id"),
	"projects": ("Live Project", "id"),
	"invites": ("Live Invite", "token"),
	"tasks": ("Live Task", "id"),
	"notifications": ("Live Notification", "id"),
	"workspaces": ("Live Workspace", "id"),
	"notes": ("Live Note", "id"),
}
# projects first, so a task saved with its new project finds it
ORDER = ("people", "workspaces", "projects", "tasks", "notes", "invites", "notifications")
# keyed maps in the store (saved one key at a time, so two people saving don't overwrite each other)
MAPS = ("settings", "hints", "seen", "onboarding", "pins", "currentWsOf", "workspace")
META = "__meta"
COMPANY_WS = "frappe"


def columns(kind: str, rec: dict) -> dict:
	"""The Desk columns for a record"""
	col = {"title": None, "status": None, "person": None, "project": None, "due": None}
	if kind == "tasks":
		col.update(title=rec.get("title"), status=rec.get("status"), person=rec.get("assignee"), project=rec.get("space"), due=rec.get("due"))
		if rec.get("deletedAt"):
			col["status"] = "deleted"
	elif kind == "projects":
		col.update(title=rec.get("name"), status=rec.get("status"), project=rec.get("code"), due=rec.get("target"))
	elif kind == "people":
		col.update(title=rec.get("name"), status="onboarded" if rec.get("onboarded") else "new", person=rec.get("user") or rec.get("email"))
	elif kind == "notifications":
		col.update(title=rec.get("type"), status="read" if rec.get("read") else "unread", person=rec.get("to"), project=rec.get("project") or rec.get("task"))
	elif kind == "workspaces":
		col.update(title=rec.get("name"), status=rec.get("kind"), person=rec.get("owner"))
	elif kind == "notes":
		col.update(title=rec.get("title") or "Untitled", person=rec.get("owner"), project=rec.get("ws"))
	elif kind == "invites":
		col.update(title=rec.get("project"), status="expired" if rec.get("expired") else "open", person=rec.get("user"))
	if col["due"]:
		try:
			col["due"] = getdate(str(col["due"])[:10])
		except Exception:
			col["due"] = None
	for key in ("title", "status", "person", "project"):
		if col[key] is not None:
			col[key] = str(col[key])[:140]
	return col


def _check_user():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError


# storage


def _all(kind: str) -> list[dict]:
	doctype = KINDS[kind][0]
	rows = frappe.get_all(doctype, fields=["data"], order_by="creation asc", limit_page_length=0)
	return [frappe.parse_json(r.data) for r in rows if r.data]


def _get(kind: str, rid: str) -> dict | None:
	data = frappe.db.get_value(KINDS[kind][0], str(rid), "data")
	return frappe.parse_json(data) if data else None


def _read_map(name: str) -> dict:
	rows = frappe.get_all("Live Map Entry", filters={"map_name": name}, fields=["map_key", "value"])
	return {r.map_key: frappe.parse_json(r.value) for r in rows}


# Fields the interface expects on every record. Records made outside the interface (an import,
# a skill writing a roadmap) get these, so a page never meets a missing list.
DEFAULTS = {
	"tasks": {
		"description": "", "labels": [], "checklist": [], "attachments": [], "rounds": [], "comments": [],
		"activity": [], "dependsOn": [], "slips": [], "mutedBy": [], "suggestion": None, "changesRequested": False,
		"priority": "p3", "due": None, "doneAt": None, "deletedAt": None, "nudgedAt": None, "ack": None,
		"milestone": None, "start": None, "reviewer": None, "status": "todo",
	},
	"projects": {
		"description": "", "milestones": [], "updates": [], "files": [], "members": [], "joinRequests": [],
		"invites": [], "projInvites": [], "status": "active",
	},
}


def with_defaults(kind: str, rec: dict) -> dict:
	for field, value in DEFAULTS.get(kind, {}).items():
		if rec.get(field) is None and value is not None:
			rec[field] = frappe.parse_json(frappe.as_json(value))
		else:
			rec.setdefault(field, value)
	return rec


def upsert(kind: str, rec: dict):
	rec = with_defaults(kind, rec)
	doctype, key = KINDS[kind]
	rid = str(rec.get(key) or "")
	if not rid:
		return
	values = {**columns(kind, rec), "data": frappe.as_json(rec, indent=None)}
	if frappe.db.exists(doctype, rid):
		frappe.db.set_value(doctype, rid, values, update_modified=True)
	else:
		frappe.get_doc({"doctype": doctype, "record_id": rid, **values}).insert(ignore_permissions=True)


def set_map_key(name: str, key: str, value):
	entry = f"{name}:{key}"
	if value is None:
		frappe.db.delete("Live Map Entry", {"name": entry})
	elif frappe.db.exists("Live Map Entry", entry):
		frappe.db.set_value("Live Map Entry", entry, "value", frappe.as_json(value, indent=None))
	else:
		frappe.get_doc(
			{"doctype": "Live Map Entry", "entry_key": entry, "map_name": name, "map_key": key, "value": frappe.as_json(value, indent=None)}
		).insert(ignore_permissions=True)


# who is signed in


def find_me(people: list[dict], user: str | None = None) -> dict | None:
	"""The person for a Frappe user: by `user`, then by email"""
	user = user or frappe.session.user
	email = (frappe.db.get_value("User", user, "email") or "").lower()
	return next((p for p in people if p.get("user") == user), None) or next(
		(p for p in people if email and (p.get("email") or "").lower() == email), None
	)


def ensure_initialized():
	"""A new site starts empty: one company workspace for the team, no demo data."""
	if frappe.db.exists("Live Map Entry", f"{META}:seeded"):
		return
	if not frappe.db.exists("Live Workspace", COMPANY_WS):
		upsert("workspaces", {"id": COMPANY_WS, "kind": "company", "name": "Frappe", "members": [], "invites": []})
	set_map_key("workspace", "name", "Frappe")
	set_map_key("workspace", "setupDone", True)
	set_map_key(META, "seeded", True)


def add_person_for_user(people: list[dict], viewer_level: str) -> dict:
	"""Someone signed in who isn't one of the people yet. Staff join the team workspace and can
	start projects. Customers only get a person record: they see the projects they are added to."""
	user = frappe.get_doc("User", frappe.session.user)
	base = frappe.scrub((user.email or user.name).split("@")[0]).replace("_", "") or "user"
	pid, n = base, 1
	ids = {p.get("id") for p in people}
	while pid in ids:
		n += 1
		pid = f"{base}{n}"
	staff = viewer_level in ("super", "admin")
	person = {
		"id": pid,
		"name": user.full_name or pid.title(),
		"role": "",
		"email": user.email,
		"user": user.name,
		"isAdmin": viewer_level == "super",
		"canCreateProjects": staff,
		"onboarded": True,
	}
	upsert("people", person)
	if staff and frappe.db.exists("Live Workspace", COMPANY_WS):
		ws = frappe.parse_json(frappe.db.get_value("Live Workspace", COMPANY_WS, "data"))
		if not any(m.get("user") == pid for m in ws.get("members", [])):
			ws["members"].append({"user": pid, "role": "Admin" if viewer_level == "super" else "Member"})
			upsert("workspaces", ws)
		set_map_key("currentWsOf", pid, COMPANY_WS)
	frappe.db.commit()
	return person


def viewer_for(user: str, people: list[dict] | None = None, projects: list[dict] | None = None) -> Viewer:
	people = people if people is not None else _all("people")
	projects = projects if projects is not None else _all("projects")
	me = find_me(people, user)
	email = frappe.db.get_value("User", user, "email") or ""
	return Viewer(user, me.get("id") if me else None, projects, email)


def visible_records(viewer: Viewer, records: dict) -> dict:
	return {
		kind: [viewer.shape(kind, r) for r in rows if viewer.can_see(kind, r)] for kind, rows in records.items()
	}


@frappe.whitelist()
def get_boot() -> dict:
	"""What this person may see (studio_app_boot hook, and a fallback API for the Studio canvas)"""
	if frappe.session.user == "Guest":
		return {}
	ensure_initialized()
	records = {kind: _all(kind) for kind in KINDS}
	viewer = viewer_for(frappe.session.user, records["people"], records["projects"])
	if not viewer.me:
		me = add_person_for_user(records["people"], viewer.level)
		records["people"].append(me)
		records["workspaces"] = _all("workspaces")
		viewer = viewer_for(frappe.session.user, records["people"], records["projects"])
	maps = {name: viewer.map_value(name, _read_map(name)) for name in MAPS}
	if not viewer.staff and viewer.me and not maps["currentWsOf"].get(viewer.me):
		first = next((viewer.projects[pid].get("ws") for pid in viewer.visible if viewer.projects[pid].get("ws")), None)
		if first:
			maps["currentWsOf"][viewer.me] = first
	return {
		"seeded": True,
		"me": viewer.me,
		"user": frappe.session.user,
		"level": viewer.level,
		"records": visible_records(viewer, records),
		"maps": maps,
	}


def check(viewer: Viewer, payload: dict):
	"""Refuse the whole save if any part of it is not allowed"""
	pending_projects = {}
	for kind in ORDER:
		change = (payload.get("records") or {}).get(kind) or {}
		key = KINDS[kind][1]
		for rec in change.get("upserts") or []:
			rid = str(rec.get(key) or "")
			if not rid:
				continue
			old = _get(kind, rid)
			if not viewer.can_write(kind, old, rec):
				frappe.throw(_("You can't change this {0}.").format(kind.rstrip("s")), frappe.PermissionError)
			if kind == "projects":
				pending_projects[rid] = rec
		for rid in change.get("deletes") or []:
			old = _get(kind, rid)
			if old and not viewer.can_write(kind, old, None):
				frappe.throw(_("You can't delete this {0}.").format(kind.rstrip("s")), frappe.PermissionError)
		if kind == "projects" and pending_projects:
			viewer.projects.update(pending_projects)
			viewer.visible |= {pid for pid, p in pending_projects.items() if viewer._sees_project(p)}
	for name, change in (payload.get("maps") or {}).items():
		if name not in MAPS:
			continue
		for key in change:
			if not viewer.can_write_map(name, key):
				frappe.throw(_("You can't change this setting."), frappe.PermissionError)


def apply(payload: dict):
	for kind in ORDER:
		change = (payload.get("records") or {}).get(kind)
		if not change:
			continue
		doctype = KINDS[kind][0]
		for rec in change.get("upserts") or []:
			upsert(kind, rec)
		for rid in change.get("deletes") or []:
			frappe.db.delete(doctype, {"name": str(rid)})
	for name, change in (payload.get("maps") or {}).items():
		if name not in MAPS:
			continue
		for key, value in change.items():
			set_map_key(name, key, value)


def broadcast(payload: dict, client: str | None):
	"""Send each signed-in person only the part of a change they may see"""
	people = _all("people")
	projects = _all("projects")
	for p in people:
		user = p.get("user") or p.get("email")
		if not user or not frappe.db.exists("User", user):
			continue
		viewer = viewer_for(user, people, projects)
		records = {}
		for kind, change in (payload.get("records") or {}).items():
			if kind not in KINDS:
				continue
			ups = [viewer.shape(kind, r) for r in change.get("upserts") or [] if viewer.can_see(kind, r)]
			if ups or change.get("deletes"):
				records[kind] = {"upserts": ups, "deletes": change.get("deletes") or []}
		maps = {}
		for name, change in (payload.get("maps") or {}).items():
			if name in MAPS:
				part = viewer.map_value(name, change)
				if part:
					maps[name] = part
		if records or maps:
			frappe.publish_realtime("live_sync", {"client": client, "records": records, "maps": maps}, user=user, after_commit=True)


@frappe.whitelist(methods=["POST"])
def save(payload: str, client: str | None = None):
	"""Save what changed in one browser and pass it on to everyone else's open tabs"""
	_check_user()
	data = frappe.parse_json(payload)
	viewer = viewer_for(frappe.session.user)
	check(viewer, data)
	apply(data)
	broadcast(data, client)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def seed(payload: str | None = None):
	"""Kept for old browsers: never stores demo data, only sets up an empty site."""
	_check_user()
	return get_boot()


def reset():
	"""Remove all Frappe Live data. Run by hand only:
	bench --site <site> execute frappe_live.api.reset"""
	for doctype, _key in KINDS.values():
		frappe.db.delete(doctype)
	frappe.db.delete("Live Map Entry")
	frappe.db.commit()
