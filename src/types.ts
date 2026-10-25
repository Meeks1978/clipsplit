/**
 * ClipSplit — shared domain types.
 *
 * The payout engine (src/engine/payout.ts) is pure: it consumes these types
 * and performs no I/O. Integration seams (LLM export parsing, PayPal sandbox
 * execution) depend on these types but the types depend on nothing.
 */

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "x";

/** Per-platform payout terms for one campaign. All money in USD. */
export interface PlatformRate {
  /** Dollars paid per 1,000 views. */
  ratePer1kUSD: number;
  /** A clip whose gross is below this pays $0 (per-clip minimum payout). */
  minPayoutUSD: number;
  /** A clip never pays more than this, however many views it gets. */
  capPerClipUSD: number;
}

/**
 * Eligibility gates. A clip that fails any gate pays $0 regardless of views.
 * Gates are evaluated against measurements carried on the ClipRecord; if a
 * gate needs a measurement the record does not carry, the engine flags
 * GATE_DATA_MISSING and pays $0 (auditable beats optimistic).
 */
export type CampaignGate =
  /** e.g. Sartain: 10,000 views within 5 days of posting, per clip. */
  | { type: "viewWindow"; minViews: number; withinDays: number }
  /** e.g. Scape: payouts start at 1,000 approved views. */
  | { type: "minViews"; minViews: number }
  /** Fraction 0..1. 0.002 = 0.20%. */
  | { type: "minEngagementRate"; minRate: number }
  /** Sum of regionShares over `regions` must reach minShare (fraction). */
  | { type: "minRegionShare"; regions: string[]; minShare: number }
  /** Share of audience in Tier-1 countries must reach minShare (fraction). */
  | { type: "minTier1Share"; minShare: number }
  /** Minimum clip length in seconds (eligibility, e.g. Santa Cruz >= 15s). */
  | { type: "minDurationSeconds"; seconds: number };

export interface CampaignRule {
  /** Stable slug used in clip records, e.g. "sartain-clipping-army". */
  id: string;
  name: string;
  /** Platform the campaign runs on (all current entries: Whop Content Rewards). */
  marketplace: string;
  /** Keyed by Platform. A platform absent here has NO rate — the engine
   *  flags MISSING_PLATFORM_RATE rather than guessing. */
  platformRates: Partial<Record<Platform, PlatformRate>>;
  gates: CampaignGate[];
  /** True when payment depends on human review the math cannot model
   *  (e.g. FreezerTarps "qualified views"). Engine pays by the numbers and
   *  surfaces this flag so statements can carry the caveat. */
  manualReview?: boolean;
  /** Where these terms were verified, and when. */
  sourceNote: string;
  /** Payout-relevant rules that do NOT fit rate/min/cap/gates. Not enforced
   *  by the engine; kept with the data so nothing is silently dropped. */
  unmodeledRules?: string[];
}

/** One normalized clip result, as produced by an export parser. */
export interface ClipRecord {
  clipId: string;
  clipperId: string;
  campaignId: string;
  platform: Platform;
  /** Total views attributed to the clip. */
  views: number;
  /** Views accrued inside the campaign's gate window (e.g. first 5 days).
   *  When absent, viewWindow gates fall back to `views` — documented in the
   *  engine; operators should supply this whenever the export has it. */
  viewsInGateWindow?: number;
  /** Engagement rate as a fraction (likes+comments+shares / views). */
  engagementRate?: number;
  /** Share of audience in Tier-1 countries, fraction 0..1. */
  tier1Share?: number;
  /** Audience share by country code, fractions summing to ~1. */
  regionShares?: Record<string, number>;
  durationSeconds?: number;
  /** ISO 8601 post timestamp, when known. */
  postedAt?: string;
  /** Source URL of the clip post, when known. */
  url?: string;
}

export type AnomalyFlag =
  | "GATE_MISSED"
  | "GATE_DATA_MISSING"
  | "BELOW_MINIMUM"
  | "CAP_APPLIED"
  | "MISSING_PLATFORM_RATE"
  | "UNKNOWN_CAMPAIGN";

export interface ClipPayout {
  clipId: string;
  clipperId: string;
  campaignId: string;
  platform: Platform;
  views: number;
  /** Rate applied, or null when no rate exists for the platform/campaign. */
  ratePer1kUSD: number | null;
  /** Views x rate before minimum/cap/fee logic. */
  grossUSD: number;
  /** Final amount owed for this clip (after gates, min, cap, optional fee). */
  payoutUSD: number;
  payable: boolean;
  flags: AnomalyFlag[];
  /** Human-readable explanation lines (the audit trail for this clip). */
  notes: string[];
}

export interface ClipperTotals {
  clipperId: string;
  clipCount: number;
  payableClipCount: number;
  totalGrossUSD: number;
  totalPayoutUSD: number;
  flagCounts: Partial<Record<AnomalyFlag, number>>;
}

export interface PayoutLedger {
  clips: ClipPayout[];
  perClipper: ClipperTotals[];
  totals: {
    clipCount: number;
    payableClipCount: number;
    totalGrossUSD: number;
    totalPayoutUSD: number;
  };
}

export interface PayoutEngineOptions {
  /** Marketplace fee taken out of the gross before payment, as a fraction
   *  (e.g. 0.10). Default 0: campaign briefs state rates/min/caps but do not
   *  state whether their minimums and caps are measured pre- or post-fee, so
   *  the engine defaults to the briefs' own numbers. See BUILDLOG.md. */
  platformFeeRate?: number;
}
