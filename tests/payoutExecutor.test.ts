import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPAIGN_RULES } from "../src/data/campaigns.ts";
import { computePayoutLedger } from "../src/engine/payout.ts";
import {
  RestPayoutExecutor,
  loadSandboxConfigFromEnv,
  type PayoutRecipient,
} from "../src/paypal/payoutExecutor.ts";
import type { ClipRecord } from "../src/types.ts";

const clips: ClipRecord[] = [
  {
    clipId: "clash-1",
    clipperId: "clipper-a",
    campaignId: "clash-x-hoh",
    platform: "youtube",
    views: 1200,
    engagementRate: 0.011,
    regionShares: { US: 0.52, UK: 0.06, CA: 0.05, AU: 0.02, OTHER: 0.35 },
  },
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
const recipients: PayoutRecipient[] = [
  { clipperId: "clipper-a", sandboxEmail: "sb-clippera@personal.example.com" },
  { clipperId: "clipper-zero", sandboxEmail: "sb-clipperzero@personal.example.com" },
];

interface RecordedCall {
  url: string;
  method: string;
  body: string | undefined;
}

/** Fake PayPal sandbox: OAuth -> create batch (PROCESSING) -> get batch (SUCCESS). */
function fakePayPal(calls: RecordedCall[]): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/v1/oauth2/token")) {
      return Response.json({ access_token: "test-token", token_type: "Bearer", expires_in: 32400 });
    }
    if (url.endsWith("/v1/payments/payouts") && method === "POST") {
      const payload = JSON.parse(body ?? "{}") as {
        sender_batch_header: { sender_batch_id: string };
        items: Array<{ sender_item_id: string; amount: { value: string } }>;
      };
      return Response.json(
        {
          batch_header: {
            payout_batch_id: "BATCH-TEST-1",
            batch_status: "PENDING",
            sender_batch_header: payload.sender_batch_header,
          },
          items: payload.items.map((item, i) => ({
            payout_item_id: `ITEM-${i + 1}`,
            transaction_status: "PENDING",
            payout_item: { sender_item_id: item.sender_item_id, amount: item.amount },
          })),
        },
        { status: 201 },
      );
    }
    if (url.includes("/v1/payments/payouts/BATCH-TEST-1")) {
      return Response.json({
        batch_header: { payout_batch_id: "BATCH-TEST-1", batch_status: "SUCCESS" },
        items: [
          {
            payout_item_id: "ITEM-1",
            transaction_status: "SUCCESS",
            payout_item: { sender_item_id: "clipsplit-clipper-a", amount: { value: "1.50" } },
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function makeExecutor(calls: RecordedCall[]): RestPayoutExecutor {
  return new RestPayoutExecutor({
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    fetchFn: fakePayPal(calls),
  });
}

const approvedRequest = {
  ledger,
  recipients,
  currency: "USD" as const,
  approvedBy: "operator",
  approvedAt: "2026-10-25T20:00:00Z",
};

describe("RestPayoutExecutor (fake sandbox transport)", () => {
  it("creates a batch from an approved ledger and reconciles $0 clippers", async () => {
    const calls: RecordedCall[] = [];
    const executor = makeExecutor(calls);
    const result = await executor.executeBatch(approvedRequest);

    assert.equal(result.sandbox, true);
    assert.equal(result.batchId, "BATCH-TEST-1");
    assert.equal(result.status, "PENDING");

    const paidItem = result.items.find((i) => i.clipperId === "clipper-a");
    assert.equal(paidItem?.amountUSD, 1.5);
    assert.equal(paidItem?.status, "PENDING");
    assert.equal(paidItem?.payoutItemId, "ITEM-1");

    const zeroItem = result.items.find((i) => i.clipperId === "clipper-zero");
    assert.equal(zeroItem?.amountUSD, 0);
    assert.equal(zeroItem?.status, "UNKNOWN");
    assert.match(zeroItem?.error ?? "", /zero balance/);

    // The create call sent exactly one item (the positive clipper) with the
    // ledger-derived idempotency key.
    const create = calls.find((c) => c.url.endsWith("/v1/payments/payouts") && c.method === "POST");
    const sent = JSON.parse(create?.body ?? "{}") as {
      sender_batch_header: { sender_batch_id: string };
      items: Array<{ receiver: string; amount: { value: string } }>;
    };
    assert.match(sent.sender_batch_header.sender_batch_id, /^clipsplit-sandbox-[0-9a-f]+$/);
    assert.equal(sent.items.length, 1);
    assert.equal(sent.items[0]?.receiver, "sb-clippera@personal.example.com");
    assert.equal(sent.items[0]?.amount.value, "1.50");
  });

  it("polls a batch to SUCCESS via getBatch", async () => {
    const calls: RecordedCall[] = [];
    const executor = makeExecutor(calls);
    await executor.executeBatch(approvedRequest);
    const result = await executor.getBatch("BATCH-TEST-1");
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.items[0]?.clipperId, "clipper-a");
    assert.equal(result.items[0]?.status, "SUCCESS");
  });

  it("refuses a batch without operator approval", async () => {
    const executor = makeExecutor([]);
    await assert.rejects(
      executor.executeBatch({ ...approvedRequest, approvedBy: "", approvedAt: "" }),
      /without operator approval/,
    );
  });

  it("refuses placeholder recipients", async () => {
    const executor = makeExecutor([]);
    await assert.rejects(executor.executeBatch({ ...approvedRequest, recipients: [] }), /placeholder recipients/);
  });

  it("refuses a non-sandbox base URL and missing credentials", () => {
    assert.throws(
      () =>
        new RestPayoutExecutor({
          clientId: "x",
          clientSecret: "y",
          baseUrl: "https://api-m.paypal.com",
        }),
      /non-sandbox/,
    );
    assert.throws(() => new RestPayoutExecutor({ clientId: "", clientSecret: "" }), /requires sandbox clientId/);
  });
});

describe("loadSandboxConfigFromEnv", () => {
  it("parses credentials and the recipient mapping", () => {
    const { config, recipients: parsed } = loadSandboxConfigFromEnv({
      PAYPAL_SANDBOX_CLIENT_ID: "cid",
      PAYPAL_SANDBOX_CLIENT_SECRET: "secret",
      PAYPAL_SANDBOX_RECIPIENTS: "operator=sb-op@personal.example.com, clipper-b=sb-b@personal.example.com",
    } as NodeJS.ProcessEnv);
    assert.equal(config.clientId, "cid");
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1]?.clipperId, "clipper-b");
  });

  it("fails precisely when credentials are not yet transferred", () => {
    assert.throws(
      () => loadSandboxConfigFromEnv({} as NodeJS.ProcessEnv),
      /not set in the environment/,
    );
  });
});
