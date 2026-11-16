---
name: frappe-live
description: Run an Assisted Onboarding in Frappe Live: start the onboarding, turn first-call notes into the customer's own roadmap under the five milestones, record done-when checks, sessions and MRR, and answer where every onboarding stands. Use when someone asks to start, plan, update or report on an assisted onboarding, or pastes call notes for one, when the site runs the Frappe Live app.
---

# Frappe Live

Frappe Live tracks every Assisted Onboarding. Each customer is a `Live Project` with five milestones (Set up, Start using, Habit, Live at day 30, Live at day 90), a `Live Onboarding` record (customer, app, site, CRM deal, live condition, money), and tasks that are their roadmap. Every step here is a whitelisted method in `frappe_live.portal`, so it works the same from the site's assistant, MCP or frappectl. You act as the connected user; the methods below need a Live Admin or Live Super Admin.

For the setup itself, on the customer's own site, use that app's implementation skill (`crm-implementation`, `helpdesk-implementation`, `learning-implementation`). This skill is the tracker around it.

## Rules

1. **Show, then write.** Before any call that writes, show what will be created or changed and wait for a yes.
2. **Their words.** Step titles are in the customer's words: "Your distributor stages are set", not "Configure CRM Deal Status".
3. **Every step has a why and a done-when.** The why ties to what they said. The done-when is a check on their site data.
4. **Use steps are theirs.** From Start using on, the owner is `customer`. Never mark one done without a check on their data.
5. **No invented facts.** No made-up numbers, dates, quotes or MRR. Unknown is "not captured".
6. **No weekend due dates.** The server moves a Saturday or Sunday to Monday.

## Start an onboarding

Call `frappe_live.portal.start_onboarding` with `customer`, `app` (CRM, ERPNext, Frappe HR, Helpdesk, Learning), and what you know: `kickoff_date` (the payment date; leave empty until they pay), `customer_email`, `customer_name`, `crm_deal`, `site_url`, `live_condition`, `main_pain`, `used_before`, `team_size`, `plan`. `invite` 1 emails the customer a sign-in link; ask first. It returns the project id.

## Make the roadmap from call notes

1. Read the notes and the app's step library (the implementation skill's `reference/steps.md` and `reference/interview.md`).
2. Keep the steps that apply. For each: `title` (their words), `milestone` (one of the five names), `why`, `done_when`, `owner` (`team` or `customer`), `due`, `block` (the library key), `new_block` true when no library step fits.
3. Show the list. On a yes, call `frappe_live.portal.add_steps` with `project` and `steps`.
4. Out-of-scope asks are not steps. Send each as feedback: `send_feedback` with type `Feature request`.

After every session, add or change steps the same way, and log it (below).

## Record what happened

| What | Call |
|---|---|
| A done-when check ran | `record_check` with `project`, `task`, `passed`, `evidence`, `source`. A pass marks the task done |
| A session | `log_session` with `project`, `date`, `kind` (First call, Help, Office Hours, Go-live review), `minutes`, `notes`, and `steps_hit`, `blockers`, `roadmap_changes`, `skill_changes`, `product_issues` |
| A paid site, or a plan change | `record_mrr` with `project`, `month`, `mrr_usd`, `change` (New, Upgrade, Downgrade, Churn), `plan`. Only with proof: the invoice |
| A message to the customer | `send_message` with `project`, `text`. Staff messages email the customer |

## Where things stand

- `frappe_live.health.refresh` works out every onboarding's stage and health from its tasks.
- `/live-reports` shows the portfolio, days to live, MRR by month and owner, and feedback.
- Read `Live Onboarding` (fields `customer`, `app`, `owner_user`, `status`, `health`, `mrr_usd`, `kickoff_date`, `live_date`) for a quick answer.

Health: Off track when a Set up task is over 7 days late or nothing happened for 14 days; At risk when anything is late or nothing happened for 7 days.

## Traps

- **Customers see only their project.** They can comment and work tasks in it, send feedback and messages. They can't create projects or edit milestones.
- **A project's tasks live in `Live Task` as JSON.** Write them through `add_steps`, not by hand, so the interface finds every field.
- **Live means** activity by their own people in the last 7 days, on a paid plan, plus their live condition. Set `live_date` on the Live Onboarding when it first holds.
