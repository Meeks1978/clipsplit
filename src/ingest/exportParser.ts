/**
 * SEAM A — LLM export parser.
 *
 * Campaign results reach the operator as messy artifacts: marketplace CSV
 * exports with inconsistent headers, pasted tables from web UIs, screenshot
 * transcriptions. This seam turns any of those into normalized ClipRecords.
 *
 * The production implementation sends the raw export to an LLM with a strict
 * JSON-schema response contract (campaign rules are supplied as context so
 * the model normalizes platform names and campaign ids to dataset slugs),
 * then validates every returned row against the ClipRecord shape before it
 * is allowed anywhere near the payout engine. Rows the model cannot map are
 * returned in `unmapped` — never silently dropped, never guessed into a
 * campaign.
 *
 * This file is interfaces + a stub. No LLM calls are made here yet.
 */

import type { ClipRecord } from "../types.ts";

export type ExportFormat = "csv" | "tsv" | "pasted-text" | "json" | "unknown";

export interface RawExport {
  format: ExportFormat;
  content: string;
  /** Optional operator hint, e.g. "this is the Whop Content Rewards export". */
  sourceHint?: string;
}

export interface ParseWarning {
  /** 1-based row/line in the source export, when known. */
  row?: number;
  message: string;
}

export interface ParseResult {
  clips: ClipRecord[];
  warnings: ParseWarning[];
  /** Raw fragments the parser could not map to a clip record, verbatim. */
  unmapped: string[];
}

/** Minimal LLM client contract the parser depends on (provider-agnostic). */
export interface LlmClient {
  /**
   * Complete a prompt and return the model's raw text. Implementations must
   * request structured (JSON) output; parsing/validation is the parser's job.
   */
  completeJSON(prompt: string): Promise<string>;
}

export interface ExportParser {
  parse(raw: RawExport): Promise<ParseResult>;
}

/**
 * Stub implementation. Throws until wired to a real LlmClient.
 *
 * TODO(hackathon week 1):
 *  1. Build the normalization prompt: dataset slugs + platform vocabulary +
 *     a worked example (messy Whop CSV row -> ClipRecord JSON).
 *  2. Validate model output row-by-row (types, non-negative views, known
 *     campaign ids); invalid rows go to `unmapped` with a warning.
 *  3. Cross-check: parsed clip count vs the export's own row count; warn on
 *     mismatch instead of trusting the model.
 *  4. Spot-check mode: re-ask the model to explain 3 sampled rows so a human
 *     can verify the mapping before payouts are computed.
 */
export class LlmExportParser implements ExportParser {
  private readonly llm: LlmClient | null;

  constructor(llm: LlmClient | null = null) {
    this.llm = llm;
  }

  async parse(_raw: RawExport): Promise<ParseResult> {
    if (!this.llm) {
      throw new Error(
        "LlmExportParser is a stub: no LlmClient configured. See TODOs in src/ingest/exportParser.ts.",
      );
    }
    throw new Error("LlmExportParser.parse is not implemented yet (hackathon week 1).");
  }
}
