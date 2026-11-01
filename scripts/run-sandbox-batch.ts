/**
 * One end-to-end LIVE sandbox batch run for ClipSplit.
 *
 * Builds the seeded-sample ledger exactly like the demo entry, attaches the
 * recipient mapping + credentials from .env, executes ONE Payouts batch via
 * RestPayoutExecutor, polls it to a terminal status, and prints the batch
 * result plus per-clipper statements. Sandbox only — the executor refuses
 * any non-sandbox base URL and any unapproved ledger.
 *
 * Operator approval for this run: Mikal Meekins (owner), "Finish the first
 * one", 2026-10-31 — supplied via the approvedBy/approvedAt fields below.
 */
import { readFileSync } from "node:fs";
import { CAMPAIGN_RULES } from "../src/data/campaigns.ts";
import { computePayoutLedger } from "../src/engine/payout.ts";
import {
  RestPayoutExecutor,
  loadSandboxConfigFromEnv,
} from "../src/paypal/payoutExecutor.ts";
import { buildStatement, renderStatementText } from "../src/paypal/statements.ts";
import type { ClipRecord } from "../src/types.ts";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);

const raw = JSON.parse(
  readFileSync(new URL("../examples/sample-clips.json", import.meta.url), "utf8"),
) as Array<Record<string, unknown>>;
const clips: ClipRecord[] = raw.map(
  ({ _comment, ...rest }) => rest as unknown as ClipRecord,
);
const ledger = computePayoutLedger(clips, CAMPAIGN_RULES);

console.log("=== Ledger ===");
for (const clip of ledger.clips) {
  const flags = clip.flags.length ? ` [${clip.flags.join(", ")}]` : "";
  console.log(`${clip.clipId}: ${clip.views} views -> $${clip.payoutUSD.toFixed(2)}${flags}`);
}
console.log(
  `Totals: $${ledger.totals.totalPayoutUSD.toFixed(2)} payable of $${ledger.totals.totalGrossUSD.toFixed(2)} gross.`,
);

const { config, recipients } = loadSandboxConfigFromEnv();
console.log(`\nRecipients mapped: ${recipients.map((r) => r.clipperId).join(", ")}`);

const executor = new RestPayoutExecutor(config);
const request = {
  ledger,
  recipients,
  currency: "USD" as const,
  approvedBy: "Mikal Meekins (owner) via Archer — 'Finish the first one', 2026-10-31",
  approvedAt: new Date().toISOString(),
  note: "ClipSplit first end-to-end sandbox batch (seeded sample ledger).",
};

console.log("\n=== Executing sandbox batch ===");
let result = await executor.executeBatch(request);
console.log(`batchId: ${result.batchId}  status: ${result.status}`);
for (const item of result.items) {
  console.log(`  ${item.clipperId}: $${item.amountUSD.toFixed(2)} ${item.status}${item.error ? " — " + item.error : ""}`);
}

const terminal = new Set(["SUCCESS", "DENIED", "FAILED"]);
for (let i = 0; i < 18 && !terminal.has(result.status); i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  result = await executor.getBatch(result.batchId);
  console.log(`poll ${i + 1}: status ${result.status}`);
}
console.log(`\nFINAL: batch ${result.batchId} -> ${result.status}`);
for (const item of result.items) {
  console.log(
    `  ${item.clipperId}: $${item.amountUSD.toFixed(2)} ${item.status}${item.payoutItemId ? " item=" + item.payoutItemId : ""}${item.error ? " — " + item.error : ""}`,
  );
}

for (const r of recipients) {
  console.log(`\n=== Statement: ${r.clipperId} ===`);
  console.log(renderStatementText(buildStatement(ledger, r.clipperId)));
}

process.exit(result.status === "SUCCESS" ? 0 : 1);
