/**
 * SEAM B — PayPal sandbox Payouts executor.
 *
 * Turns an approved PayoutLedger into a PayPal Payouts batch in the SANDBOX
 * environment only.
 *
 * IMPLEMENTATION NOTE (verified 2026-10-25): the pinned
 * `@paypal/agent-toolkit` (v1.11.0, installed and inspected) exposes Orders,
 * Invoicing, Subscriptions, Products, Disputes, Refunds and Tracking tools —
 * it has NO Payouts tools at all (zero "payout" matches in the package).
 * The original stub plan ("construct the toolkit and call its payouts
 * tools") is therefore impossible as written. This executor instead calls
 * the PayPal Payouts REST API directly:
 *   POST /v1/oauth2/token            (client_credentials)
 *   POST /v1/payments/payouts        (create batch)
 *   GET  /v1/payments/payouts/{id}   (poll / reconcile)
 * The payload sent is exactly the one `buildSandboxBatchPreview` produces,
 * so what the demo previews is what is submitted. The Agent Toolkit remains
 * the right tool for the invoice/statement seam in ./statements.ts.
 *
 * Safety invariants:
 *  - Sandbox base URL only; the constructor refuses any other base URL.
 *  - A batch is created ONLY from a ledger the operator explicitly approved
 *    (approvedBy + approvedAt on the request) — the executor never approves.
 *  - Placeholder recipients (sb-<clipperId>@example.com) are refused: every
 *    payable clipper must have a real sandbox recipient mapping.
 *  - One batch item per clipper (their ledger total), with the ledger's
 *    per-clip detail carried in the statement, not in the batch.
 *  - Idempotency: sender_batch_id is derived from the ledger hash (via the
 *    preview builder) so a retry can never double-pay a clipper.
 *  - $0 clippers are reported as items with status "UNKNOWN" and an
 *    explanatory error rather than being dropped silently.
 */

import type { PayoutLedger } from "../types.ts";
import { buildSandboxBatchPreview } from "./batchPreview.ts";

export interface PayoutRecipient {
  clipperId: string;
  /** Sandbox personal-account email for this clipper. */
  sandboxEmail: string;
}

export interface PayoutBatchRequest {
  ledger: PayoutLedger;
  recipients: PayoutRecipient[];
  currency: "USD";
  /** Operator sign-off — required, executor must refuse without it. */
  approvedBy: string;
  approvedAt: string; // ISO 8601
  note?: string;
}

export type PayoutBatchStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "DENIED"
  | "FAILED"
  | "UNKNOWN";

export interface PayoutBatchItemResult {
  clipperId: string;
  amountUSD: number;
  status: PayoutBatchStatus;
  /** PayPal payout_item_id, once known. */
  payoutItemId?: string;
  error?: string;
}

export interface PayoutBatchResult {
  /** PayPal payout_batch_id. */
  batchId: string;
  status: PayoutBatchStatus;
  items: PayoutBatchItemResult[];
  sandbox: true;
}

export interface PayoutExecutor {
  /** Create (but do not auto-approve anything beyond) a sandbox batch. */
  executeBatch(request: PayoutBatchRequest): Promise<PayoutBatchResult>;
  /** Poll a previously created batch. */
  getBatch(batchId: string): Promise<PayoutBatchResult>;
}

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

type FetchFn = typeof fetch;

export interface RestPayoutExecutorConfig {
  clientId: string;
  clientSecret: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: FetchFn;
  /** Sandbox only — any value other than the sandbox base URL is refused. */
  baseUrl?: string;
}

interface PayPalBatchHeader {
  payout_batch_id: string;
  batch_status: string;
  sender_batch_header?: { sender_batch_id?: string };
}

interface PayPalBatchItem {
  payout_item_id?: string;
  transaction_status?: string;
  payout_item?: {
    sender_item_id?: string;
    amount?: { value?: string };
  };
  errors?: { name?: string; message?: string };
}

interface PayPalBatchResponse {
  batch_header: PayPalBatchHeader;
  items?: PayPalBatchItem[];
}

function mapBatchStatus(raw: string | undefined): PayoutBatchStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "SUCCESS":
      return "SUCCESS";
    case "PENDING":
    case "NEW":
      return "PENDING";
    case "PROCESSING":
      return "PROCESSING";
    case "DENIED":
      return "DENIED";
    case "CANCELED":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

function mapItemStatus(raw: string | undefined): PayoutBatchStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "SUCCESS":
      return "SUCCESS";
    case "PENDING":
    case "ONHOLD":
    case "UNCLAIMED":
      return "PENDING";
    case "PROCESSING":
      return "PROCESSING";
    case "DENIED":
      return "DENIED";
    case "FAILED":
    case "BLOCKED":
    case "REFUNDED":
    case "RETURNED":
    case "REVERSED":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

export class RestPayoutExecutor implements PayoutExecutor {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchFn: FetchFn;
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  /** sender_item_id -> clipperId, remembered so getBatch can reconcile. */
  private readonly senderItemClipper = new Map<string, string>();

  constructor(config: RestPayoutExecutorConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        "RestPayoutExecutor requires sandbox clientId and clientSecret (PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_SECRET).",
      );
    }
    const baseUrl = config.baseUrl ?? SANDBOX_BASE_URL;
    if (baseUrl !== SANDBOX_BASE_URL) {
      throw new Error(
        `Refusing non-sandbox PayPal base URL "${baseUrl}". ClipSplit is sandbox-only during the hackathon.`,
      );
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.fetchFn = config.fetchFn ?? fetch;
    this.baseUrl = baseUrl;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await this.fetchFn(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`PayPal sandbox OAuth failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("PayPal sandbox OAuth returned no access_token.");
    this.accessToken = body.access_token;
    return this.accessToken;
  }

  private async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    return this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  async executeBatch(request: PayoutBatchRequest): Promise<PayoutBatchResult> {
    if (!request.approvedBy || !request.approvedAt) {
      throw new Error(
        "Refusing to create a payout batch without operator approval (approvedBy + approvedAt are required).",
      );
    }
    if (request.currency !== "USD") {
      throw new Error(`Refusing non-USD payout batch (currency: ${request.currency}).`);
    }

    const preview = buildSandboxBatchPreview(request.ledger, request.recipients, {
      operatorLabel: request.approvedBy,
    });

    const placeholders = preview.items.filter((i) => i.receiverIsPlaceholder);
    if (placeholders.length > 0) {
      throw new Error(
        `Refusing to pay placeholder recipients for: ${placeholders
          .map((i) => i.clipperId)
          .join(", ")}. Supply real sandbox recipient mappings.`,
      );
    }
    if (preview.items.length === 0) {
      throw new Error("Refusing to create an empty payout batch: no clipper has a positive ledger total.");
    }

    const res = await this.authedFetch("/v1/payments/payouts", {
      method: "POST",
      body: JSON.stringify(preview.payload),
    });
    if (!res.ok) {
      throw new Error(`PayPal sandbox create-batch failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as PayPalBatchResponse;
    const batchId = body.batch_header?.payout_batch_id;
    if (!batchId) throw new Error("PayPal sandbox create-batch returned no payout_batch_id.");

    for (const item of preview.items) this.senderItemClipper.set(item.senderItemId, item.clipperId);

    return this.toResult(body, request.ledger);
  }

  async getBatch(batchId: string): Promise<PayoutBatchResult> {
    const res = await this.authedFetch(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
    if (!res.ok) {
      throw new Error(`PayPal sandbox get-batch failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as PayPalBatchResponse;
    return this.toResult(body, null);
  }

  private toResult(body: PayPalBatchResponse, ledger: PayoutLedger | null): PayoutBatchResult {
    const items: PayoutBatchItemResult[] = (body.items ?? []).map((item) => {
      const senderItemId = item.payout_item?.sender_item_id ?? "";
      const clipperId =
        this.senderItemClipper.get(senderItemId) ??
        (senderItemId.startsWith("clipsplit-") ? senderItemId.slice("clipsplit-".length) : senderItemId);
      return {
        clipperId,
        amountUSD: Number(item.payout_item?.amount?.value ?? 0),
        status: mapItemStatus(item.transaction_status),
        payoutItemId: item.payout_item_id,
        error: item.errors ? `${item.errors.name ?? "ERROR"}: ${item.errors.message ?? ""}`.trim() : undefined,
      };
    });

    // Account for $0 clippers explicitly (never silently dropped) when the
    // originating ledger is known — i.e. on the executeBatch path.
    if (ledger) {
      const paid = new Set(items.map((i) => i.clipperId));
      for (const totals of ledger.perClipper) {
        if (totals.totalPayoutUSD <= 0 && !paid.has(totals.clipperId)) {
          items.push({
            clipperId: totals.clipperId,
            amountUSD: 0,
            status: "UNKNOWN",
            error: "zero balance — nothing to pay",
          });
        }
      }
    }

    return {
      batchId: body.batch_header.payout_batch_id,
      status: mapBatchStatus(body.batch_header.batch_status),
      items,
      sandbox: true,
    };
  }
}

/**
 * Load sandbox config + recipient mapping from environment variables.
 * Recipients format (per .env.example): "clipperId=email,clipperId=email".
 * Throws with a precise message when the credentials have not been filled
 * in yet — that state is a known, expected blocker until the operator
 * transfers them from the PayPal Developer dashboard.
 */
export function loadSandboxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
  config: RestPayoutExecutorConfig;
  recipients: PayoutRecipient[];
} {
  const clientId = env.PAYPAL_SANDBOX_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PAYPAL_SANDBOX_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_SECRET are not set in the environment (.env). " +
        "Transfer them from the PayPal Developer dashboard (\"ClipSplit\" sandbox app) before running a live sandbox batch.",
    );
  }
  const recipients: PayoutRecipient[] = (env.PAYPAL_SANDBOX_RECIPIENTS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) throw new Error(`Malformed PAYPAL_SANDBOX_RECIPIENTS entry: "${pair}" (expected clipperId=email).`);
      return { clipperId: pair.slice(0, idx).trim(), sandboxEmail: pair.slice(idx + 1).trim() };
    })
    .filter((r) => r.sandboxEmail.length > 0);
  return { config: { clientId, clientSecret }, recipients };
}
