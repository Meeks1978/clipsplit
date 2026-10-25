/**
 * Sandbox batch PREVIEW — builds the exact PayPal Payouts request payload
 * the Seam B executor (./payoutExecutor.ts) would send for an approved
 * ledger, without any network call, credentials, or side effects.
 *
 * Purpose: the operator (and the demo video) can inspect the full batch —
 * recipients, amounts, sender_batch_id idempotency key — before the real
 * sandbox executor exists. When the executor lands, it consumes this same
 * payload shape, so what is previewed is what will be sent.
 *
 * Recipients: real sandbox emails come from the operator's recipient
 * mapping (PayoutBatchRequest.recipients). Until then, clippers get a
 * clearly-fake placeholder on the reserved .example domain:
 * "sb-<clipperId>@example.com". Placeholders must never reach a real
 * Payouts call — the executor is responsible for refusing them.
 */

import type { PayoutLedger } from "../types.ts";
import type { PayoutRecipient } from "./payoutExecutor.ts";

export interface SandboxBatchPreviewItem {
  senderItemId: string;
  clipperId: string;
  receiverEmail: string;
  /** True when receiverEmail is a placeholder, not a mapped sandbox account. */
  receiverIsPlaceholder: boolean;
  amountUSD: number;
  note: string;
}

export interface SkippedClipper {
  clipperId: string;
  reason: string;
}

/** The PayPal Payouts API request body shape (create-batch). */
export interface PayPalPayoutsPayload {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message: string;
  };
  items: Array<{
    recipient_type: "EMAIL";
    amount: { value: string; currency: "USD" };
    receiver: string;
    note: string;
    sender_item_id: string;
  }>;
}

export interface SandboxBatchPreview {
  /** Discriminator: this is a preview, not an executed batch. */
  preview: true;
  environment: "sandbox";
  senderBatchId: string;
  items: SandboxBatchPreviewItem[];
  skipped: SkippedClipper[];
  totalAmountUSD: number;
  payload: PayPalPayoutsPayload;
}

export function placeholderSandboxEmail(clipperId: string): string {
  return `sb-${clipperId}@example.com`;
}

/** Small deterministic hash (djb2) — idempotency key material, not crypto. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface BatchPreviewMeta {
  /** Operator name/id shown in the per-item note. */
  operatorLabel?: string;
  emailSubject?: string;
}

/**
 * Build the sandbox batch preview for a ledger.
 *
 * Rules (mirroring the executor's TODO contract in payoutExecutor.ts):
 * - One item per clipper with a positive ledger total.
 * - $0 clippers are NOT silently dropped: they appear in `skipped` with
 *   the reason (their anomaly flags), so the preview accounts for every
 *   clipper in the ledger.
 * - sender_batch_id derives from the ledger contents, so re-previewing the
 *   same ledger yields the same idempotency key the executor would use.
 */
export function buildSandboxBatchPreview(
  ledger: PayoutLedger,
  recipients: PayoutRecipient[] = [],
  meta: BatchPreviewMeta = {},
): SandboxBatchPreview {
  const emailByClipper = new Map(recipients.map((r) => [r.clipperId, r.sandboxEmail]));
  const operatorLabel = meta.operatorLabel ?? "ClipSplit operator";
  const emailSubject = meta.emailSubject ?? "Your ClipSplit campaign payout";

  const items: SandboxBatchPreviewItem[] = [];
  const skipped: SkippedClipper[] = [];

  for (const totals of ledger.perClipper) {
    if (totals.totalPayoutUSD <= 0) {
      const flags = Object.entries(totals.flagCounts)
        .map(([flag, count]) => `${flag} x${count}`)
        .join(", ");
      skipped.push({
        clipperId: totals.clipperId,
        reason:
          `Ledger total $0.00 across ${totals.clipCount} clip(s) — nothing to pay` +
          (flags ? ` (${flags})` : "") +
          `.`,
      });
      continue;
    }
    const mapped = emailByClipper.get(totals.clipperId);
    items.push({
      senderItemId: `clipsplit-${totals.clipperId}`,
      clipperId: totals.clipperId,
      receiverEmail: mapped ?? placeholderSandboxEmail(totals.clipperId),
      receiverIsPlaceholder: mapped === undefined,
      amountUSD: totals.totalPayoutUSD,
      note:
        `ClipSplit payout: ${totals.payableClipCount} payable clip(s) of ${totals.clipCount} ` +
        `from ${operatorLabel}. Per-clip detail is in your statement.`,
    });
  }

  const fingerprint = hashString(
    JSON.stringify(
      ledger.perClipper.map((t) => [t.clipperId, t.totalPayoutUSD, t.clipCount]),
    ) + `|${ledger.totals.clipCount}|${ledger.totals.totalPayoutUSD}`,
  );
  const senderBatchId = `clipsplit-sandbox-${fingerprint}`;

  const payload: PayPalPayoutsPayload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: emailSubject,
      email_message:
        "Your clipping campaign payout has been sent by the ClipSplit operator. " +
        "A per-clip statement accompanies this payment.",
    },
    items: items.map((item) => ({
      recipient_type: "EMAIL",
      amount: { value: item.amountUSD.toFixed(2), currency: "USD" },
      receiver: item.receiverEmail,
      note: item.note,
      sender_item_id: item.senderItemId,
    })),
  };

  return {
    preview: true,
    environment: "sandbox",
    senderBatchId,
    items,
    skipped,
    totalAmountUSD: items.reduce((sum, i) => Math.round((sum + i.amountUSD) * 100) / 100, 0),
    payload,
  };
}
