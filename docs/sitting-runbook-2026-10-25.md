# ClipSplit owner sitting — one-pass runbook (prepared 2026-10-25)

Owner is in the sitting now (started in main chat 2026-10-25 ~12:57 UTC,
Devpost login card already presented). Finish all four steps in this one
pass per the owner_secret_signups_one_pass skill — do not park a live
session waiting on a secret.

## Verified local state before the sitting (checked 2026-10-25 ~13:05 UTC)

- Local build at `~/workspace/hackathon-paypal-2026/clipsplit` — tests
  re-run in this prep: **44/44 pass** (`npm test`).
- **Not a git repository yet** — no `.git`, no remote. The public GitHub
  repo the hackathon requires does not exist yet; creating it is step 4
  below, not a pre-existing fact.
- `.env.example` now exists (added in this prep): variable names match
  `src/paypal/payoutExecutor.ts` — `PAYPAL_SANDBOX_CLIENT_ID`,
  `PAYPAL_SANDBOX_CLIENT_SECRET`, plus a recipient-mapping line.
  `.gitignore` already excludes `.env` and `paypal-sandbox-credentials*.json`.
- Sample ledger clippers needing sandbox personal accounts: `operator`
  and `clipper-b` (from `examples/sample-clips.json`). The batch preview
  currently emits placeholder receivers `sb-<clipperId>@example.com` —
  those must be replaced with the real sandbox emails confirmed in step 3
  before any executor run.

## The four steps, in order

1. **Devpost** — sign in / join the PayPal AI Hackathon. GitHub sign-in
   preferred: it also completes step 4's account confirmation.
2. **PayPal Developer** — log in with Mikal's personal PayPal account,
   create sandbox app named exactly **ClipSplit**. Client ID + Secret go
   to secure storage / local `.env` only — never through chat, never
   committed.
3. **Sandbox accounts** — confirm the auto-created sandbox **business**
   account (the sender), then confirm/create personal test accounts for
   `operator` and `clipper-b` and record their sandbox emails in the
   recipient mapping (`.env` line `PAYPAL_SANDBOX_RECIPIENTS`).
4. **GitHub** — confirm the account for the public repo, then locally:
   `git init`, add README/LICENSE/src/tests/ui/docs (respect `.gitignore`),
   first commit, create public repo, push. Verify the repo page loads
   logged-out before calling this done.

## After the sitting (Archer, no owner needed)

- Wire `AgentToolkitPayoutExecutor` (stub in
  `src/paypal/payoutExecutor.ts`) against the sandbox using the stored
  credentials + the confirmed recipient mapping; keep sandbox base URL
  only and the approved-ledger guard already documented in that file.
- Run one end-to-end sandbox Payouts batch from the sample ledger and
  record batch ID + per-item statuses in `BUILDLOG.md`.
- That run is the exact evidence the **Oct 31 go/no-go checkpoint**
  (cron `paypal-hackathon-checkpoint-oct31`, 2026-10-31 10:50 EDT)
  checks: batch SUCCESS = GO; otherwise pivot to InvoicePilot per
  BUILDLOG. Submission target Nov 10; hard deadline Nov 12, 3:00 PM ET.

## If a step cannot finish in this pass

Stop cleanly, record which steps verified complete in `BUILDLOG.md`
(done / not created / partly created), and do not leave a browser
session parked on a login page. Resume from the verified state only —
do not rerun a completed step.
