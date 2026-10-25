# ClipSplit

**Campaign payout splitter for clipping operators.**

Clipping operators who run per-view campaigns (Whop Content Rewards and
similar marketplaces) owe money to the clippers who produced the clips —
and the math is miserable. Every campaign has a different rate per 1,000
views, a different per-clip minimum payout, a different per-clip cap, and
its own eligibility gates (10,000 views in 5 days; 80% US audience; 1.2%
engagement; payouts only start at 1,000 views…). View counts arrive as
messy exports and screenshots, and a spreadsheet quietly gets it wrong.

ClipSplit fixes the workflow end to end:

1. **Ingest** — paste or upload a campaign results export (CSV, pasted
   table, raw text). An LLM parses and normalizes it into structured clip
   records; anything it cannot map is surfaced, never silently dropped.
2. **Price** — a deterministic rules engine applies each campaign's real
   rate / minimum / cap / gate terms and produces an auditable payout
   ledger. Every clip carries its math and, when it pays $0, the exact
   reason (gate missed, below minimum, cap applied, missing rate…).
3. **Approve** — the operator reviews the ledger and flags before money
   moves. Nothing is paid on an unapproved ledger.
4. **Pay** — the approved split executes as a **PayPal Payouts batch in
   the sandbox** via the official PayPal Agent Toolkit, and every clipper
   receives a per-clip statement explaining their payout line by line.

Built for the **PayPal AI Hackathon** (submission deadline Nov 12, 2026).
Sandbox only — no real money moves, ever, in this codebase's hackathon
configuration.

## Why this exists

The operator behind ClipSplit runs 24 concurrent clipping campaigns and
lives this problem daily: one campaign rejected two clips for missing a
10,000-views-in-5-days gate at 1,309 and 1,225 views; another pays from
1,000 views; a third's brief never defines its own "qualified views."
The campaign rules dataset in this repo (`src/data/campaigns.ts`) is not
sample data — it is those real, verified campaign terms, each with its
source noted.

## Architecture

```
 messy export ──► [Seam A: deterministic parser,      ──► ClipRecord[]
                    LLM parser for what it can't map]
                                                        │
                                                        ▼
                            [Payout engine — pure TS, fully tested]
                            campaign rules dataset (real terms)
                                                        │
                                                        ▼
                              PayoutLedger (per-clip audit trail
                              + per-clipper totals + anomaly flags)
                                                        │
                                    operator approves ────┤
                                                        ▼
              [Seam B: PayPal sandbox Payouts executor]  [Statements:
               via @paypal/agent-toolkit]                 per-clipper,
                                                          Agent Toolkit
                                                          invoicing]
```

| Path | Contents |
|---|---|
| `src/types.ts` | Domain types: campaign rules, gates, clip records, ledger, anomaly flags |
| `src/data/campaigns.ts` | Rules dataset — 14 real campaigns, source-noted |
| `src/engine/payout.ts` | Pure payout engine (gates → min → cap → optional fee), no I/O |
| `src/ingest/exportParser.ts` | Seam A: LLM export-parser interface + stub |
| `src/ingest/deterministicParser.ts` | Seam A, deterministic path: rule-based CSV/TSV/JSON parser with mapping report (implemented) |
| `src/paypal/payoutExecutor.ts` | Seam B: sandbox Payouts executor interface + stub |
| `src/paypal/batchPreview.ts` | Builds the exact sandbox batch payload for an approved ledger — preview only, no network (implemented) |
| `src/paypal/statements.ts` | Per-clipper statement builder/renderer (implemented) + delivery stub |
| `src/index.ts` | Demo entry: prices the seeded sample and prints ledger + statement |
| `examples/sample-clips.json` | Seeded clips, including real observed cases |
| `ui/` | Demo console (AG Grid ledger + summary + batch preview); static, fed by generated `data.js` |
| `docs/` | LLM parser prompt template; demo video script |
| `tests/payout.test.ts` | Engine test suite (25 tests) |
| `tests/parser.test.ts` | Deterministic parser tests over messy fixtures in `tests/fixtures/` |
| `tests/batchPreview.test.ts` | Sandbox batch-preview tests |

## Run it

Requires Node ≥ 22 (the repo runs TypeScript directly via Node's native
type stripping — no build step, no dependencies to install for the demo).

```bash
npm test        # full test suite (engine + parser + batch preview)
npm run demo    # price the seeded sample clips, print ledger + a statement
npm run ui      # regenerate ui/data.js, then open ui/index.html in a browser
```

The demo console (`ui/index.html`) renders the ledger on AG Grid with a
per-clipper summary, an anomaly panel, and a "Run payout batch" panel that
shows the sandbox payload the executor would send — clearly labeled
SANDBOX PREVIEW, with no network calls (AG Grid itself loads from a CDN;
a plain-table fallback renders if it is unreachable).

Ingestion routing: structured exports go through the deterministic parser
first (`src/ingest/deterministicParser.ts` — every inference and dropped
row is reported). Files it cannot map route to the LLM parser
(`docs/llm-parser-prompt.md`) under the same never-guess contract.

For development with full type checking: `npm install` then
`npm run typecheck`.

PayPal sandbox wiring (week 1 of the build) reads credentials from the
environment — never from the repo:

```bash
PAYPAL_SANDBOX_CLIENT_ID=... PAYPAL_SANDBOX_CLIENT_SECRET=...
```

## Rules the engine enforces

- Gates are evaluated before money: a clip failing any gate pays $0, with
  the failed gate named. A gate whose measurement is missing from the
  record pays $0 with `GATE_DATA_MISSING` — unverifiable is not payable.
- A platform with no stated rate in a campaign's brief is
  `MISSING_PLATFORM_RATE`. The engine never invents a rate (one real
  campaign allows posting to X but never prices it — so X pays "unknown,"
  not a guess).
- Gross below the campaign's per-clip minimum pays $0 (`BELOW_MINIMUM`);
  gross above the per-clip cap pays the cap (`CAP_APPLIED`).
- Marketplace fees are an explicit engine option (default 0), because the
  briefs state their minimums/caps without saying whether they are
  measured pre- or post-fee.

## AI use disclosure (hackathon requirement)

- **In the product:** an LLM (provider behind the `LlmClient` interface in
  `src/ingest/exportParser.ts`) parses unstructured campaign exports into
  clip records and drafts the plain-language anomaly explanations and
  clipper summaries. All payout math is deterministic code — the LLM never
  computes or moves money.
- **In development:** this project is being built with the assistance of
  an AI agent (Muse, by Meta). Campaign terms in the dataset were
  verified by reading the live campaign briefs; test cases are drawn from
  real observed campaign outcomes.

## License

MIT — see [LICENSE](./LICENSE).
