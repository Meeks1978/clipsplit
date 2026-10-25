# ClipSplit — Build Log

Entry: PayPal AI Hackathon. **Submission deadline: Thu Nov 12, 2026, 3:00 pm ET.**
Concept and full plan: `~/workspace/research_notes/paypal-hackathon-20261022/report.md` (Concept A).

## Status — 2026-10-22 (scaffold day)

DONE (local only — no accounts created, nothing published, no PayPal calls):

- [x] Project skeleton: package.json (TypeScript, `@paypal/agent-toolkit`
      declared for the integration phase), tsconfig, .gitignore, MIT LICENSE,
      README with architecture + AI-use disclosure.
- [x] Campaign-rules dataset (`src/data/campaigns.ts`): **14 real campaigns**
      encoded from verified joined-campaign briefs (Sartain, Boxabl Official,
      CLASH x HOH, FreezerTarps, BOXED, Backyard Breaks, Cantina UGC,
      Jacob & Co, Juvon, Scape, Space Cadet, Modern Warfare 4, Santa Cruz
      Medicinals, Allen Stone) — per-platform rate/min/cap + gates, each with
      a source note. GALA GLP-1 deliberately excluded (its brief contradicts
      itself on rate: $5.00/1K headline vs "(3 CPM)").
- [x] Pure payout engine (`src/engine/payout.ts`): gates → below-minimum →
      cap → optional marketplace fee; per-clip audit notes; per-clipper
      aggregation; anomaly flags GATE_MISSED / GATE_DATA_MISSING /
      BELOW_MINIMUM / CAP_APPLIED / MISSING_PLATFORM_RATE / UNKNOWN_CAMPAIGN.
- [x] Test suite (`tests/payout.test.ts`): **25/25 passing** on Node 24
      (`npm test`), including the real observed cases — Sartain clip at
      1,309 views = GATE_MISSED/$0; CLASH clip at 1,200 views = $1.50.
- [x] Demo entry (`npm run demo`): prices `examples/sample-clips.json`
      (real cases) and prints the ledger + a rendered clipper statement.
- [x] Seam A stub (`src/ingest/exportParser.ts`): LLM export-parser
      interfaces (RawExport / ParseResult / LlmClient / ExportParser) + TODOs.
- [x] Seam B stubs (`src/paypal/`): PayoutExecutor + statement-delivery
      interfaces for the Agent Toolkit; statement builder/renderer itself is
      implemented and used by the demo.

## Status — 2026-10-22 (phase 2: demo UI, deterministic parser, demo script)

DONE (local only — no accounts created, nothing published, no PayPal calls,
no packages installed):

- [x] **Deterministic export parser** (`src/ingest/deterministicParser.ts`):
      Seam A's rule-based path, implementing the existing ExportParser
      contract. Handles CSV / TSV / semicolon / JSON exports: synonym
      header mapping ("Plays" -> views, "Posted by" -> clipper), platform
      synonyms (YT / YouTube Shorts / TT / IG…), quoted thousands
      separators, K/M view suffixes, % -> fraction shares, mm:ss durations,
      region-share columns, and campaign resolution by exact id / exact
      name / unique prefix — never fuzzy. Returns a **MappingReport**
      (header map, every inference, every dropped row with its reason);
      dropped rows also land verbatim in `unmapped`, per the seam contract.
- [x] **Parser fixtures + tests** (`tests/fixtures/`, `tests/parser.test.ts`):
      3 messy fixtures modeled on real Whop/YouTube export shapes — a
      comma CSV with % demographic columns, a pasted TSV table, a
      semicolon (European Excel) export. Covers the required cases: the
      real Sartain gate clip prices $0 GATE_MISSED end-to-end through the
      engine; a malformed row (views "N/A") is dropped with its reason,
      alongside unknown-campaign and missing-platform drops. Also asserts
      the honest-data behavior: a pasted export with no Tier-1 column
      yields GATE_DATA_MISSING, not a guessed payout.
- [x] **LLM parser prompt template** (`docs/llm-parser-prompt.md`): system
      + user prompt with the dataset summary slot, strict JSON schema,
      never-invent rules, a worked example, the routing criteria for when
      a file goes to the LLM instead of the deterministic parser, and the
      post-response validation contract (incl. row-count reconciliation
      and spot-check mode).
- [x] **Sandbox batch preview** (`src/paypal/batchPreview.ts`): builds the
      exact PayPal Payouts payload for an approved ledger from the Seam B
      types — one item per positive-total clipper, $0 clippers listed as
      skipped with reasons, `sender_batch_id` derived from the ledger as
      the idempotency key. Placeholder receivers are
      `sb-<clipperId>@example.com` until the operator supplies the real
      sandbox recipient mapping. No network, no credentials.
- [x] **Demo UI skeleton** (`ui/`): static page, zero build — open
      `index.html` in a browser. AG Grid (Community, via jsDelivr CDN
      link, referenced not vendored) renders (a) the clip ledger fed by
      `examples/sample-clips.json` priced by the real engine — clipper,
      campaign, platform, views, gate status, gross, flags — (b) the
      per-clipper payout summary grid + anomaly panel with the engine's
      own explanations, (c) a "Run payout batch" panel labeled SANDBOX
      PREVIEW that renders the batchPreview payload. If the CDN is
      unreachable, app.js falls back to plain tables with the same data.
      Data regenerates with `npm run ui` (`ui/build-ui-data.ts`); the
      generated `ui/data.js` is committed so the page works as-is.
      Verified headlessly against a DOM stub: stats line, both grids'
      fallback tables, 3 anomalies, simulated batch click renders the
      payload JSON.
- [x] **Demo script** (`docs/demo-script.md`): 8 beats, target 2:30 /
      hard cap < 3:00 — hook (24-campaign mess) -> messy export + mapping
      report -> ledger -> anomalies with the real Sartain gate miss ->
      approve -> sandbox batch -> per-clipper statement -> disclosure
      card. Beats 6–7 are marked [LIVE SLOT]: filmed against the preview
      today and against the real sandbox run once credentials exist.
- [x] Tests: **44/44 passing** (`npm test`) — 25 engine + 15 parser +
      4 batch preview.

Phase-2 design decisions worth knowing:

1. **Deterministic-first ingestion.** The concept pitch leads with the
   LLM parser, but most real exports are mechanically messy, not
   semantically ambiguous — a rule-based parser is auditable in a way an
   LLM pass is not, and its MappingReport is better demo material ("shows
   its work"). The LLM remains the routed fallback under the same
   never-guess contract. Demo script beat 2 is written to this framing.
2. **Preview module is shared, not UI-only.** `batchPreview.ts` lives in
   `src/paypal/` next to the executor stub and produces the real Payouts
   payload shape, so the week-1 executor consumes the same mapping the
   demo shows. The executor TODO now has a concrete payload to send.
3. **AG Grid via CDN, not vendored**, per the zero-install constraint —
   with a tested plain-table fallback so the demo page never hard-fails
   offline. The grid code targets the Community UMD build + quartz theme
   CSS (v34 CDN paths); if AG Grid changes its packaging, only the two
   <link>/<script> URLs in `ui/index.html` change.

## Checkpoint — Fri Oct 31, 2026 (go / no-go)

**Criterion: a PayPal sandbox Payouts batch completes end-to-end** —
batch created from an approved ledger, per-item statuses reconcile, batch
reaches SUCCESS in sandbox.

- If YES: continue ClipSplit per the milestones below.
- If NO: **pivot to InvoicePilot** (Concept C in the research report —
  natural-language invoicing agent on the same Agent Toolkit wiring and the
  same scaffold). Do not slip the deadline chasing Payouts.

## Remaining milestones (from the research report)

| Date | Milestone |
|---|---|
| Fri Oct 23 – Sat Oct 24 | Devpost registration (owner step); public GitHub repo created with license file (owner confirms account) |
| Sat Oct 24 – Sun Oct 25 | **Owner sitting (~30–45 min, single batch):** PayPal Developer login, sandbox app + client ID/secret to secure storage, sandbox business + 3 personal test accounts confirmed |
| Mon Oct 26 – Wed Oct 28 | Core build: rules engine UI (AG Grid ledger), LLM ingestion pipeline wired (Seam A) |
| Thu Oct 29 – Fri Oct 30 | PayPal Payouts sandbox end-to-end (Seam B); Agent Toolkit statements |
| **Fri Oct 31** | **GO/NO-GO CHECKPOINT (above)** |
| Sat Oct 31 – Tue Nov 3 | Payout review/approve flow, status tracking, anomaly explanations, seeded demo data, edge cases |
| Wed Nov 4 – Thu Nov 5 | Hosted demo live (Render); clean-clone run test against README; judge test credentials documented |
| Fri Nov 6 | Feature freeze; full dress rehearsal of the demo flow |
| Sat Nov 7 – Sun Nov 8 | Demo video (<3 min), recorded, edited, uploaded public to YouTube (owner approval at that time) |
| Mon Nov 9 | Devpost submission completed in full (description, tools disclosure, repo + video links), reviewed end-to-end |
| **Tue Nov 10** | **SUBMIT** (two days of buffer) |
| Wed Nov 11 – Thu Nov 12 | Buffer only; verify submission shows complete. Deadline Nov 12, 3:00 pm ET |

## Modeling decisions & known gaps (honest list)

1. **Sartain pricing basis.** The brief gates on views *within 5 days* but
   prices "per 1K views" without saying whether post-window views count.
   The engine prices total views and gates on in-window views
   (`viewsInGateWindow`, falling back to total views when absent). If a
   live re-read of the brief resolves this, change one line in the engine
   and one test.
2. **Below-minimum = $0.** Briefs state dollar minimums without saying
   whether sub-minimum earnings bank toward later payouts. Engine pays $0;
   matches the operator's observed rejection pattern.
3. **Whop's 10% fee** is an engine option (`platformFeeRate`, default 0):
   briefs don't state whether min/cap are pre- or post-fee.
4. **Not modeled (recorded in the dataset instead):** per-platform
   sub-budgets (Jacob & Co), aggregate per-clipper caps (Scape $750/round),
   pool balances, procedural evidence steps (Google Form / screen
   recordings / support tickets), post-retention and likes-visible
   compliance checks.
5. **FreezerTarps "qualified views"** has no formula in the brief (manual
   brand review decides). Dataset sets `manualReview: true`; the engine
   computes by the numbers and the statement carries the caveat.
6. **Unpriced platforms are real:** FreezerTarps permits X posting but
   states no X rate; Space Cadet and MW4 have no YouTube rate. The engine
   flags these MISSING_PLATFORM_RATE rather than borrowing another
   platform's rate.
