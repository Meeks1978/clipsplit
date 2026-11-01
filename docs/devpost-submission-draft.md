# ClipSplit — Devpost submission draft (prepared 2026-10-28)

Status: DRAFT, local only. Nothing has been entered on Devpost. The Devpost
project entry does not exist yet (per BUILDLOG, Oct 25 sitting: "No team or
project entry created yet") — creating it is an external submission and
needs the owner's go-ahead.

Key dates (Devpost email, 2026-10-28):
- Submit by **Thu Nov 5, 2026** → review team checks the project for
  eligibility early and flags anything to fix. Entry can keep being edited
  until the deadline.
- Submissions close **Thu Nov 12, 2026, 12:00 PM PST** (3:00 PM ET).

## Project name
ClipSplit

## Tagline / one-liner
Campaign payout splitter for clipping operators: messy campaign exports in,
an auditable payout ledger out, paid as one PayPal Payouts sandbox batch.

## Description (names PayPal and AI explicitly, per Devpost guidance)
Clipping operators who run per-view campaigns (Whop Content Rewards and
similar marketplaces) owe money to the clippers who produced the clips —
and the math is miserable. Every campaign has a different rate per 1,000
views, a different per-clip minimum, a different per-clip cap, and its own
eligibility gates (10,000 views in 5 days; payouts only from 1,000 views;
manual brand review). View counts arrive as messy exports, and a
spreadsheet quietly gets it wrong.

ClipSplit fixes the workflow end to end:
1. **Ingest** — paste or upload a campaign results export. An AI/LLM parser
   normalizes what the deterministic parser cannot map; anything unmapped
   is surfaced, never silently dropped.
2. **Price** — a deterministic rules engine (no LLM math) applies each
   campaign's real rate / minimum / cap / gate terms and produces an
   auditable payout ledger. Every $0 line carries its exact reason.
3. **Approve** — the operator reviews the ledger and anomaly flags. The
   executor refuses to pay an unapproved batch.
4. **Pay with PayPal** — the approved split executes as a **PayPal Payouts
   batch in the sandbox**, via the PayPal Payouts REST API (OAuth
   client-credentials → POST /v1/payments/payouts → batch poll, with an
   idempotency key derived from the ledger so a retry can never
   double-pay). Every clipper receives a per-clip statement explaining
   their payout line by line.

The campaign rules dataset is not sample data — it is real, verified
campaign terms from the operator's own running campaigns, each with its
source noted. Sandbox only: no real money moves.

AI use: an LLM parses unstructured exports and drafts plain-language
anomaly explanations; all payout math is deterministic code — the LLM
never computes or moves money. The project was built with the assistance
of an AI agent (Muse, by Meta).

## Built With
TypeScript (Node ≥ 22, native type stripping) · PayPal Payouts REST API
(sandbox) · LLM parser behind a `LlmClient` interface · AG Grid (demo
console) · Node test runner (51/51 tests passing as of 2026-10-27)

## Try it / run instructions (from README)
Public repo: https://github.com/Meeks1978/clipsplit
```bash
npm test        # full test suite (engine + parser + batch preview + executor)
npm run demo    # price the seeded sample clips, print ledger + a statement
npm run ui      # regenerate ui/data.js, then open ui/index.html in a browser
```
No hosted demo URL exists; Devpost accepts clear run instructions in the
repo instead. API keys are environment variables only, never committed
(.env is gitignored).

## Demo video
Script ready: docs/demo-script.md (target 2:30, hard cap < 3:00).
Beats 2–4 are filmable now against committed fixtures. Beats 6–7 (the live
sandbox batch) must be filmed after the credential capture + one
end-to-end sandbox batch. Upload is a public YouTube posting — owner
approval needed at that time.

## Remaining before a Nov 5 early-check submission
1. **Credential capture (owner, ~1 minute)** — paste the PayPal sandbox
   Client ID + Secret into the local form at http://127.0.0.1:8799/
   (verified live 2026-10-29 ~01:04 UTC; the server dies on runtime
   restarts, so re-verify/restart immediately before the sitting).
   .env fields verified still empty 2026-10-29; recipients mapping present.
2. Run one end-to-end sandbox Payouts batch to the two test accounts and
   verify batch status (Archer, after step 1).
3. Oct 31 go/no-go checkpoint (cron `paypal-hackathon-checkpoint-oct31`
   already scheduled, Sat Oct 31 10:50 AM ET).
4. Film demo video beats 6–7 live take; assemble full cut.
5. Create the Devpost project entry and paste this draft in (owner
   go-ahead required — external submission).
6. Push the local README correction (Agent Toolkit → Payouts REST API)
   to GitHub with the next commit batch (external push; rides with the
   checkpoint work, not done yet).
