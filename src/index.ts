/**
 * ClipSplit demo entry point (scaffold stage).
 *
 * Loads the seeded sample clips (real observed cases from the operator's own
 * clipping run), prices them with the pure payout engine against the real
 * campaign-rules dataset, and prints the ledger + one clipper statement.
 *
 * Run:  npm run demo     (Node >= 22, no dependencies to install)
 *
 * The full product adds, in order: LLM export ingestion (src/ingest),
 * an operator approve step, and the PayPal sandbox Payouts executor +
 * statement delivery (src/paypal). See BUILDLOG.md for the milestone plan.
 */

import { readFileSync } from "node:fs";
import { CAMPAIGN_RULES } from "./data/campaigns.ts";
import { computePayoutLedger } from "./engine/payout.ts";
import { buildStatement, renderStatementText } from "./paypal/statements.ts";
import type { ClipRecord } from "./types.ts";

const raw = JSON.parse(
  readFileSync(new URL("../examples/sample-clips.json", import.meta.url), "utf8"),
) as Array<Record<string, unknown>>;

// Strip the human "_comment" annotations; keep only ClipRecord fields.
const clips: ClipRecord[] = raw.map(({ _comment, ...rest }) => rest as unknown as ClipRecord);

const ledger = computePayoutLedger(clips, CAMPAIGN_RULES);

console.log("=== ClipSplit ledger (seeded sample) ===");
for (const clip of ledger.clips) {
  const flags = clip.flags.length ? ` [${clip.flags.join(", ")}]` : "";
  console.log(
    `${clip.clipId}: ${clip.views} views -> $${clip.payoutUSD.toFixed(2)}${flags}`,
  );
}
console.log(
  `\nTotals: ${ledger.totals.payableClipCount}/${ledger.totals.clipCount} clips payable, ` +
    `$${ledger.totals.totalPayoutUSD.toFixed(2)} payable of $${ledger.totals.totalGrossUSD.toFixed(2)} gross.`,
);

console.log("\n=== Sample statement ===");
console.log(renderStatementText(buildStatement(ledger, "operator")));
