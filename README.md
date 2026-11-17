# Frappe Live

One place for every Assisted Onboarding at Frappe. Each customer gets a project with five milestones (Set up, Start using, Habit, Live at day 30, Live at day 90) and a roadmap made for them on their first call.

Built on the interface of Frappe Tasks by Swarali (MIT), with a server-side access system and the records an onboarding needs.

## Who sees what

| Level | Who | Sees and does |
| --- | --- | --- |
| Super admin | Emails listed in Live Settings | Everything; imports, MRR, settings |
| Admin | Anyone on the admin domain (frappe.io), given at sign-in | Every project; runs their own; reports |
| User | Customers | Only the projects they are members of: their plan, tasks, messages, feedback |

Every record a person receives is filtered on the server (`frappe_live/access.py`), every save is checked before it is written, and the Live doctypes follow the same rule (`frappe_live/live_docs.py`).

## What's in it

| Part | Where |
| --- | --- |
| Inbox: what needs the team today (customers waiting, slipping, moved, paid with no roadmap) | `/live/inbox` (team) |
| Messages: the customer's home (next step with Done and Stuck, milestones, Office Hours) and one stream per customer for the team | `/live/messages` |
| A project: the onboarding card (live check, next steps, details, sessions) and the roadmap | `/live/p/<project>` (team) |
| Office Hours, Fridays: questions by customer, log the call once | `/live/office-hours` (team) |
| Reports: live by day 30 and 90, days to live, MRR by month and owner, every onboarding, Start onboarding | `/live/reports` (team) |
| Onboarding details, feedback, messages, MRR, sessions, checks | Live Onboarding, Live Feedback, Live Message, Live MRR, Live Session, Live Check |
| Methods for the team and for skills | `frappe_live.portal`, `frappe_live.views` |
| Raven bridge (frappe.io), with email to the team when Raven isn't set up | `frappe_live.raven` |
| Stage, health and live | `frappe_live.health` |
| Skill for Claude and Flow | `skills/frappe-live` |
| Draft of frappe.io/live | `website/frappe-io-live.html` |

Live is a record: paid (MRR), active in the last 7 days and the customer's own condition (checks from their site, `record_live`). The first day all three hold is `live_date`.

## Install (Frappe Cloud, private bench, version-16)

Apps: frappe, studio, frappe_live (and insights for deeper analysis).

```bash
bench get-app https://github.com/frappe/studio --branch develop
bench get-app https://github.com/MauliMogal/frappe-live --branch develop
bench --site <site> install-app studio frappe_live
bench --site <site> build-studio-app live
```

Then in **Live Settings**: super admin emails, admin domain, Office Hours link, booking link, and the two Raven values below.

## Raven

1. On frappe.io Raven, create a channel (for example `frappe-live-inbox`), a bot, and a **Raven Incoming Webhook** for that channel. Put its URL in Live Settings, "Incoming webhook URL".
2. Create a **Raven Webhook**: trigger Message Sent, condition on that channel, request URL `https://<live site>/api/method/frappe_live.raven.receive`, security on with a secret, data fields `text`, `owner`, `is_reply`, `replied_message_details`, `is_bot_message`. Put the secret in Live Settings.
3. Customer messages and feedback post to the channel. Reply to a post (Reply, not a thread) and the answer reaches the customer by email and in Messages. Until Raven is set up, customer messages are emailed to the onboarding's owner.

## Import the current onboardings

As a super admin, call `frappe_live.portal.import_onboardings` with a list of rows (`customer`, `app`, `crm_deal`, `owner_user`, `customer_email`, `customer_name`, `kickoff_date`). It skips deals already in and emails nobody.

## Tests

```bash
bench --site <site> set-config allow_tests true
bench --site <site> run-tests --app frappe_live
```
