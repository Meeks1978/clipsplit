# ClipSplit — demo video script (outline)

Target runtime **2:30**, hard cap **< 3:00** (hackathon rule).
Format: screen capture of the demo console (`ui/index.html`) + terminal,
voiceover recorded over it. Shot on the seeded sample data
(`examples/sample-clips.json`) unless a beat says otherwise.

**Live-sandbox slots** are marked **[LIVE SLOT]**: those beats are filmed
twice — once against the sandbox *preview* (what exists today) and once
against the real sandbox run (once the PayPal Developer credentials from
the owner sitting exist). The final cut uses the live take; the preview
take is the fallback if sandbox access slips past Nov 6 (freeze date).

| # | Time | Beat | On screen | Voiceover (key lines) |
|---|---|---|---|---|
| 1 | 0:00–0:18 | **Hook — the 24-campaign mess** | Fast scroll of the campaign-rules dataset file; cut to a Whop submissions list full of "Pending / Rejected". | "I run twenty-four clipping campaigns. Every one pays a different rate, a different minimum, a different cap — and two of my clips were rejected for missing a ten-thousand-view gate I computed wrong in a spreadsheet. This is ClipSplit: it does that math, proves it, and pays it out." |
| 2 | 0:18–0:40 | **Messy export in** | Paste the messy Whop CSV (`tests/fixtures/whop-export-messy.csv`) on screen: quoted "1,309"s, `YT`/`TT`, a `Tier 1 %` column, an `Earnings` column ClipSplit ignores. Show the mapping report: headers mapped, inferences listed. | "Results arrive like this — marketplace exports with whatever headers, percent signs, and platform slang they feel like. ClipSplit parses them deterministically, and shows its work: what it mapped, what it inferred, what it dropped and why. Nothing is silently dropped, and nothing is guessed." |
| 3 | 0:40–1:05 | **Rules applied — the ledger** | Demo console, ledger grid (AG Grid): 5 clips priced. Sort by payout. The two Sartain rows show $0.00; CLASH shows $1.50; the Instagram Sartain clip shows $24.80. | "Then a deterministic rules engine — not an LLM — applies each campaign's real terms. Same export, five clips, three different outcomes, every one explainable line by line." |
| 4 | 1:05–1:35 | **Anomalies flagged — the real gate miss** | Anomaly panel zoom: `sartain-clip-2 — GATE_MISSED`. Show the engine note ("1,309 in-window views < 10,000 required within 5 days") next to the campaign's actual rejection from the operator's run. Then the Boxabl row: 7 views, BELOW_MINIMUM. | "This one is real. My own clip closed at 1,309 views; the campaign gate was ten thousand in five days. ClipSplit flags it before money moves — gate missed, zero dollars, reason attached. And it never pays on a missing measurement: no Tier-1 data, no payout — it flags instead of guessing." |
| 5 | 1:35–1:50 | **Approve** | Operator reviews per-clipper summary grid (operator $1.50, clipper-b $24.80); click "approve" (console batch panel). | "The operator reviews the split and approves it. Nothing pays out on an unapproved ledger — the executor refuses without a sign-off." |
| 6 | 1:50–2:15 | **Sandbox batch** **[LIVE SLOT]** | Click "Run payout batch": the payload renders (sender_batch_id, one item per clipper, amounts). **Preview take ends here**, labeled SANDBOX PREVIEW. **Live take:** the same click executes via the PayPal Agent Toolkit; cut to the PayPal sandbox dashboard showing the batch PROCESSING → SUCCESS with both items. | "One approved ledger becomes one PayPal Payouts batch — in the sandbox. One item per clipper, an idempotency key derived from the ledger so a retry can never double-pay, and the batch reconciles item by item." |
| 7 | 2:15–2:28 | **Per-clipper statement** | Rendered statement for clipper-b (statements module, `src/paypal/statements.ts`): the $24.80 clip with its rate, gate pass, and minimum check spelled out. | "Every clipper gets a statement that explains their payment clip by clip — the rate, the gates, the math. No more 'trust me' screenshots." |
| 8 | 2:28–2:30 | **Close + disclosure card** | Title card: "ClipSplit — built for the PayPal AI Hackathon. Sandbox only; no real money. AI use: an LLM parses exports; all payout math is deterministic code." | "ClipSplit. The mess in, the split out — auditable end to end." |

## Production notes

- Record the console at 1080p with browser zoom ~110% so grid text is
  legible; keep the amber SANDBOX banner in frame for beats 3–6.
- Beats 2–4 can be filmed today against the committed fixtures and seeded
  data. Beats 6–7 need the live take filmed after the Oct 31 checkpoint
  confirms the sandbox batch end-to-end (see BUILDLOG.md); if the
  checkpoint fails, the project has pivoted to InvoicePilot and this
  script is superseded.
- Upload is public YouTube, **< 3:00**, per hackathon rules; the public
  posting needs the owner's approval at that time (per the milestone
  plan, Nov 7–8).
