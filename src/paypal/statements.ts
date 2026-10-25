/**
 * SEAM B2 — per-clipper statement generator.
 *
 * A statement is the audit document a clipper receives: every clip, the
 * campaign rule that priced it, what it earned or exactly why it earned $0
 * (the engine's notes, in plain language). Generation from a PayoutLedger is
 * pure and implemented; DELIVERY of the statement as a PayPal invoice /
 * payment record via the Agent Toolkit's invoicing tools is the stubbed
 * part (interfaces only, no API calls).
 */

import type { ClipPayout, PayoutLedger } from "../types.ts";

export interface ClipperStatement {
  clipperId: string;
  generatedAt: string; // ISO 8601
  lines: ClipPayout[];
  totalGrossUSD: number;
  totalPayoutUSD: number;
  /** Plain-language summary (an LLM drafts the friendly version in the full
   *  product; this deterministic version is the fallback and the audit base). */
  summary: string;
}

export function buildStatement(
  ledger: PayoutLedger,
  clipperId: string,
  generatedAt: string = new Date().toISOString(),
): ClipperStatement {
  const lines = ledger.clips.filter((c) => c.clipperId === clipperId);
  const totals = ledger.perClipper.find((t) => t.clipperId === clipperId);
  const totalGrossUSD = totals?.totalGrossUSD ?? 0;
  const totalPayoutUSD = totals?.totalPayoutUSD ?? 0;
  const unpaid = lines.filter((l) => !l.payable).length;
  const summary =
    `${lines.length} clip(s) reviewed: ${lines.length - unpaid} payable, ` +
    `${unpaid} at $0 (see per-clip reasons). Gross $${totalGrossUSD.toFixed(2)}, ` +
    `total payable $${totalPayoutUSD.toFixed(2)}.`;
  return { clipperId, generatedAt, lines, totalGrossUSD, totalPayoutUSD, summary };
}

export function renderStatementText(statement: ClipperStatement): string {
  const out: string[] = [
    `ClipSplit payout statement — ${statement.clipperId}`,
    `Generated: ${statement.generatedAt}`,
    "",
    statement.summary,
    "",
  ];
  for (const line of statement.lines) {
    out.push(
      `- ${line.clipId} [${line.campaignId}/${line.platform}] ${line.views} views` +
        ` -> $${line.payoutUSD.toFixed(2)}${line.payable ? "" : " (not payable)"}`,
    );
    for (const note of line.notes) out.push(`    ${note}`);
  }
  out.push("", `TOTAL PAYABLE: $${statement.totalPayoutUSD.toFixed(2)}`);
  return out.join("\n");
}

/** Delivery of a statement through PayPal (Agent Toolkit invoicing tools). */
export interface StatementDeliverer {
  /**
   * Create a sandbox invoice / payment record carrying this statement for
   * the clipper and return its PayPal invoice id.
   */
  deliverAsInvoice(
    statement: ClipperStatement,
    recipientSandboxEmail: string,
  ): Promise<{ invoiceId: string; sandbox: true }>;
}

/**
 * Stub. TODO(hackathon week 1): wire to the Agent Toolkit invoicing tools
 * (create/send invoice in sandbox), attach renderStatementText(statement) as
 * the invoice note/detail, and record invoiceId against the payout batch so
 * statement <-> batch <-> ledger reconcile three ways.
 */
export class AgentToolkitStatementDeliverer implements StatementDeliverer {
  async deliverAsInvoice(
    _statement: ClipperStatement,
    _recipientSandboxEmail: string,
  ): Promise<{ invoiceId: string; sandbox: true }> {
    throw new Error(
      "AgentToolkitStatementDeliverer is a stub: invoicing wiring lands in hackathon week 1.",
    );
  }
}
