import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPAIGN_RULES } from "../src/data/campaigns.ts";
import { computePayoutLedger } from "../src/engine/payout.ts";
import { buildSandboxBatchPreview } from "../src/paypal/batchPreview.ts";
import type { ClipRecord } from "../src/types.ts";

const clips: ClipRecord[] = [
  // Payable CLASH clip for clipper-a (real observed scale: 1,200 views -> $1.50).
  {
    clipId: "clash-1",
    clipperId: "clipper-a",
    campaignId: "clash-x-hoh",
    platform: "youtube",
    views: 1200,
    engagementRate: 0.011,
    regionShares: { US: 0.52, UK: 0.06, CA: 0.05, AU: 0.02, OTHER: 0.35 },
  },
  // Gate-missed Sartain clip for clipper-zero (real observed case) -> $0 total.
  {
    clipId: "sartain-1",
    clipperId: "clipper-zero",
    campaignId: "sartain-clipping-army",
    platform: "youtube",
    views: 1309,
    viewsInGateWindow: 1309,
    tier1Share: 0.72,
  },
];

const ledger = computePayoutLedger(clips, CAMPAIGN_RULES);

describe("sandbox batch preview", () => {
  it("creates one item per positive-total clipper, in PayPal payload shape", () => {
    const preview = buildSandboxBatchPreview(ledger);
    assert.equal(preview.preview, true);
    assert.equal(preview.environment, "sandbox");
    assert.equal(preview.items.length, 1);
    assert.equal(preview.items[0].clipperId, "clipper-a");
    assert.equal(preview.items[0].amountUSD, 1.5);
    assert.equal(preview.totalAmountUSD, 1.5);
    const item = preview.payload.items[0];
    assert.equal(item.recipient_type, "EMAIL");
    assert.equal(item.amount.value, "1.50");
    assert.equal(item.amount.currency, "USD");
    assert.equal(item.sender_item_id, "clipsplit-clipper-a");
    assert.equal(
      preview.payload.sender_batch_header.sender_batch_id,
      preview.senderBatchId,
    );
  });

  it("skips $0 clippers with the reason instead of dropping them silently", () => {
    const preview = buildSandboxBatchPreview(ledger);
    assert.equal(preview.skipped.length, 1);
    assert.equal(preview.skipped[0].clipperId, "clipper-zero");
    assert.match(preview.skipped[0].reason, /nothing to pay/);
    assert.match(preview.skipped[0].reason, /GATE_MISSED/);
  });

  it("uses placeholder .example emails unless a recipient mapping is supplied", () => {
    const unmapped = buildSandboxBatchPreview(ledger);
    assert.equal(unmapped.items[0].receiverEmail, "sb-clipper-a@example.com");
    assert.equal(unmapped.items[0].receiverIsPlaceholder, true);
    const mapped = buildSandboxBatchPreview(ledger, [
      { clipperId: "clipper-a", sandboxEmail: "sb-a@real-sandbox.test" },
    ]);
    assert.equal(mapped.items[0].receiverEmail, "sb-a@real-sandbox.test");
    assert.equal(mapped.items[0].receiverIsPlaceholder, false);
    assert.equal(mapped.payload.items[0].receiver, "sb-a@real-sandbox.test");
  });

  it("derives a stable sender_batch_id from the ledger (idempotency)", () => {
    const a = buildSandboxBatchPreview(ledger);
    const b = buildSandboxBatchPreview(ledger);
    assert.equal(a.senderBatchId, b.senderBatchId);
    assert.match(a.senderBatchId, /^clipsplit-sandbox-[0-9a-f]{8}$/);
  });
});
