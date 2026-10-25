/**
 * SEAM B — PayPal sandbox Payouts executor.
 *
 * Turns an approved PayoutLedger into a PayPal Payouts batch in the SANDBOX
 * environment only, via the official @paypal/agent-toolkit (the same toolkit
 * also backs the statement/invoice seam in ./statements.ts).
 *
 * Interfaces + stub only. No PayPal calls are made from this file, and no
 * credentials exist in the repo: sandbox client ID/secret are supplied at
 * runtime through environment variables (PAYPAL_SANDBOX_CLIENT_ID /
 * PAYPAL_SANDBOX_CLIENT_SECRET) once the operator's owner-only developer
 * account step is complete.
 *
 * Safety invariants for the real implementation:
 *  - Sandbox base URL only; refuse to construct a client for the live
 *    environment from this codebase during the hackathon.
 *  - A batch is created ONLY from a ledger the operator explicitly approved
 *    (approvedBy + approvedAt on the request) — the executor never approves.
 *  - One batch item per clipper (their ledger total), with the ledger's
 *    per-clip detail carried in the statement, not in the batch.
 *  - Idempotency: sender_batch_id is derived from the ledger hash so a
 *    retry can never double-pay a clipper.
 */

import type { PayoutLedger } from "../types.ts";

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

/**
 * Stub implementation backed by the PayPal Agent Toolkit.
 *
 * TODO(hackathon week 1, checkpoint Oct 31):
 *  1. Construct the toolkit in sandbox mode:
 *       import { PayPalAgentToolkit } from "@paypal/agent-toolkit";
 *       const toolkit = new PayPalAgentToolkit({
 *         clientId, clientSecret, configuration: { context: { sandbox: true } }
 *       });
 *     (Confirm the exact payouts tool names against the toolkit version
 *     pinned in package.json at implementation time — do not guess tool ids.)
 *  2. Map ledger per-clipper totals -> one Payouts item each; skip $0
 *     clippers and report them as items with status "UNKNOWN" + error
 *     "zero balance — nothing to pay" rather than dropping them silently.
 *  3. Persist batchId -> ledger hash so getBatch can reconcile statuses.
 *  4. OCT 31 CHECKPOINT: a sandbox batch must complete end-to-end
 *     (batch SUCCESS with per-item statuses) or the project pivots to the
 *     InvoicePilot fallback per the research report. See BUILDLOG.md.
 */
export class AgentToolkitPayoutExecutor implements PayoutExecutor {
  async executeBatch(_request: PayoutBatchRequest): Promise<PayoutBatchResult> {
    throw new Error(
      "AgentToolkitPayoutExecutor is a stub: PayPal sandbox wiring lands in hackathon week 1. See TODOs in src/paypal/payoutExecutor.ts.",
    );
  }

  async getBatch(_batchId: string): Promise<PayoutBatchResult> {
    throw new Error("AgentToolkitPayoutExecutor.getBatch is not implemented yet.");
  }
}
