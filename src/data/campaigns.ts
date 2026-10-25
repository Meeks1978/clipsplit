/**
 * Campaign rules dataset — REAL terms, verified live on Whop Content Rewards
 * by the operator (Archer) across 2026-10-10 → 2026-10-22, from the campaign
 * briefs and detail pages of campaigns the operator actually joined.
 *
 * Every entry carries a sourceNote naming the brief/read it came from.
 * Rates are USD per 1,000 views. "Min" = per-clip minimum payout (a clip
 * grossing less pays $0). "Cap" = per-clip maximum payout.
 *
 * Deliberately NOT encoded:
 * - GALA GLP-1 — its brief contradicts itself on the rate ($5.00/1K headline
 *   vs "(3 CPM)" in the body). Encoding either figure would be inventing a
 *   term. Excluded until the live brief is re-read.
 * - Campaigns whose terms were only ever seen on a Discover card (never on a
 *   joined brief) are excluded: card data has proven unreliable.
 */

import type { CampaignRule } from "../types.ts";

export const CAMPAIGN_RULES: CampaignRule[] = [
  {
    id: "sartain-clipping-army",
    name: "Michael Sartain's Clipping Army",
    marketplace: "Whop Content Rewards",
    platformRates: {
      instagram: { ratePer1kUSD: 2.0, minPayoutUSD: 19, capPerClipUSD: 200 },
      facebook: { ratePer1kUSD: 2.0, minPayoutUSD: 19, capPerClipUSD: 200 },
      youtube: { ratePer1kUSD: 1.5, minPayoutUSD: 15, capPerClipUSD: 100 },
      tiktok: { ratePer1kUSD: 1.0, minPayoutUSD: 10, capPerClipUSD: 100 },
      x: { ratePer1kUSD: 1.0, minPayoutUSD: 10, capPerClipUSD: 100 },
    },
    gates: [
      { type: "viewWindow", minViews: 10_000, withinDays: 5 },
      // Brief: audience must be majority Tier 1; <50% Tier 1 = rejected.
      { type: "minTier1Share", minShare: 0.5 },
    ],
    sourceNote:
      "Brief + rate table re-read in a signed-in Whop session 2026-10-15 (files/sartain-whop-reread-2026-10-15.md); rates first read 2026-10-10 (files/clipping-campaign-terms.md). Gate confirmed by outcome: two operator clips were rejected 'Did not meet the 10k view minimum' (2026-10-22).",
    unmodeledRules: [
      "Qualifying views must be evidenced via the campaign Google Form within 24h of hitting 10K plus an analytics screen recording — procedural, not payout math.",
    ],
  },
  {
    id: "boxabl-official",
    name: "Boxabl Official (Clip Farm)",
    marketplace: "Whop Content Rewards",
    platformRates: {
      youtube: { ratePer1kUSD: 0.5, minPayoutUSD: 1, capPerClipUSD: 500 },
      tiktok: { ratePer1kUSD: 0.5, minPayoutUSD: 1, capPerClipUSD: 500 },
      instagram: { ratePer1kUSD: 0.5, minPayoutUSD: 1, capPerClipUSD: 500 },
      x: { ratePer1kUSD: 0.5, minPayoutUSD: 1, capPerClipUSD: 500 },
    },
    gates: [],
    sourceNote:
      "Campaign terms read 2026-10-10 (files/clipping-campaign-terms.md); brief rules confirmed at join 2026-10-11. $1 minimum at $0.50/1K = payouts start at 2,000 views/clip.",
  },
  {
    id: "clash-x-hoh",
    name: "CLASH x HOH Clipping",
    marketplace: "Whop Content Rewards",
    platformRates: {
      youtube: { ratePer1kUSD: 1.25, minPayoutUSD: 1.25, capPerClipUSD: 250 },
      instagram: { ratePer1kUSD: 1.25, minPayoutUSD: 1.25, capPerClipUSD: 250 },
      tiktok: { ratePer1kUSD: 1.25, minPayoutUSD: 1.25, capPerClipUSD: 250 },
    },
    gates: [
      { type: "minEngagementRate", minRate: 0.002 },
      { type: "minRegionShare", regions: ["US", "UK", "CA", "AU"], minShare: 0.4 },
    ],
    sourceNote:
      "Full brief read 2026-10-19 from the Whop app + linked brief doc (files/clash-brief-2026-10-19.md). Min $1.25 = first dollar at 1,000 views.",
    unmodeledRules: [
      "Likes must be visible and the post kept up >= 30 days — compliance checks, verified outside payout math.",
      "Demographics submission + support ticket after minimum payout is the payment-approval step — procedural.",
    ],
  },
  {
    id: "freezertarps-flightreacts",
    name: "FreezerTarps x FlightReacts x Nick Nayersina",
    marketplace: "Whop Content Rewards",
    platformRates: {
      youtube: { ratePer1kUSD: 1.5, minPayoutUSD: 1, capPerClipUSD: 500 },
      instagram: { ratePer1kUSD: 1.5, minPayoutUSD: 1, capPerClipUSD: 500 },
    },
    gates: [],
    manualReview: true,
    sourceNote:
      "Full brief read 2026-10-19 (files/freezertarps-and-asg-briefs-2026-10-19.md). YouTube Shorts / X / Instagram Reels only per brief platform list, but the payout sections price only YouTube + Instagram — X has NO stated rate and is deliberately absent here (a TikTok post likewise has no rate: platforms list says 'No TikTok'). Draft pre-approval required by the app before posting.",
    unmodeledRules: [
      "'Qualified views' is NOT formulaically defined in the brief — it means views on clips passing manual brand review (DraftKings). The engine computes by rate/min/cap; whether a specific clip's views qualified is a human-review outcome the math cannot model.",
      "Audience expectation 75%+ aged 25+, US-primary in a DraftKings state — stated as a qualification expectation, not a numeric payout gate; not encoded as a gate.",
    ],
  },
  {
    id: "boxed",
    name: "BOXED Clipping",
    marketplace: "Whop Content Rewards",
    platformRates: {
      youtube: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 400 },
      tiktok: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 400 },
      instagram: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 400 },
    },
    gates: [],
    sourceNote:
      "Detail-page terms read 2026-10-18 (files/campaign-terms-pass-screen-2026-10-18.md). No gate, dedicated page, or deadline stated.",
  },
  {
    id: "backyard-breaks",
    name: "Backyard Breaks",
    marketplace: "Whop Content Rewards",
    platformRates: {
      youtube: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 250 },
      instagram: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 250 },
      tiktok: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 250 },
    },
    gates: [],
    sourceNote:
      "Detail-page terms read 2026-10-18 (files/campaign-terms-pass-screen-2026-10-18.md). Dedicated campaign pages required — an account rule, not payout math.",
  },
  {
    id: "cantina-ugc",
    name: "Cantina UGC Reposting",
    marketplace: "Whop Content Rewards",
    platformRates: {
      tiktok: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 300 },
      youtube: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 300 },
      instagram: { ratePer1kUSD: 1.0, minPayoutUSD: 1, capPerClipUSD: 300 },
    },
    gates: [],
    sourceNote:
      "Detail-page terms read 2026-10-18 (files/campaign-terms-pass-screen-2026-10-18.md).",
  },
  {
    id: "jacob-and-co",
    name: "Jacob & Co x Kylie Jenner",
    marketplace: "Whop Content Rewards",
    platformRates: {
      instagram: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 400 },
      tiktok: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 400 },
      youtube: { ratePer1kUSD: 2.0, minPayoutUSD: 2, capPerClipUSD: 400 },
    },
    gates: [
      { type: "minEngagementRate", minRate: 0.002 },
      { type: "minRegionShare", regions: ["US", "UK", "CA", "AU"], minShare: 0.4 },
    ],
    sourceNote:
      "Joined-brief terms recorded 2026-10-20 (campaign radar baseline, JOINED section). Brief writes the region set as 'US/UK/CA/AUS'.",
    unmodeledRules: [
      "Per-platform sub-budgets (YouTube $2,000 of the $10,000 pool) drain independently — a budget-availability constraint, not per-clip math; the engine does not model pool balances.",
    ],
  },
  {
    id: "juvon-clips",
    name: "Juvon Clips",
    marketplace: "Whop Content Rewards",
    platformRates: {
      instagram: { ratePer1kUSD: 3.0, minPayoutUSD: 4.5, capPerClipUSD: 150 },
      tiktok: { ratePer1kUSD: 3.0, minPayoutUSD: 4.5, capPerClipUSD: 150 },
      youtube: { ratePer1kUSD: 3.0, minPayoutUSD: 4.5, capPerClipUSD: 150 },
    },
    gates: [],
    sourceNote:
      "Joined-brief terms recorded 2026-10-19 (campaign radar baseline, JOINED section). Min $4.50 at $3.00/1K = 1,500 views to first dollar.",
  },
  {
    id: "scape",
    name: "Scape — clip Gravity at Steam Next Fest",
    marketplace: "Whop Content Rewards",
    platformRates: {
      tiktok: { ratePer1kUSD: 1.5, minPayoutUSD: 1.5, capPerClipUSD: 150 },
      youtube: { ratePer1kUSD: 1.5, minPayoutUSD: 1.5, capPerClipUSD: 150 },
    },
    gates: [{ type: "minViews", minViews: 1_000 }],
    sourceNote:
      "Joined-brief terms recorded 2026-10-20 (campaign radar baseline, JOINED section): 'pay starts at 1,000 approved views'. Submission window 2026-10-20 → 2026-10-27 UTC; views counted for 7 days after approval, none after 2026-11-10.",
    unmodeledRules: [
      "$750 cap per clipper per round is an AGGREGATE cap across a clipper's clips — the per-clip engine reports per-clipper totals so a batch layer can enforce it, but the engine itself does not truncate at $750.",
      "The submission/approval window is a scheduling constraint, not payout math.",
    ],
  },
  {
    id: "space-cadet",
    name: "Space Cadet: Movie Trailer Clipping",
    marketplace: "Whop Content Rewards",
    platformRates: {
      instagram: { ratePer1kUSD: 1.5, minPayoutUSD: 2.5, capPerClipUSD: 400 },
      tiktok: { ratePer1kUSD: 1.5, minPayoutUSD: 2.5, capPerClipUSD: 400 },
    },
    gates: [
      { type: "minRegionShare", regions: ["US"], minShare: 0.8 },
      { type: "minEngagementRate", minRate: 0.002 },
    ],
    sourceNote:
      "Joined-brief terms recorded 2026-10-20 (campaign radar baseline, JOINED section); route/format re-verified 2026-10-22 (files/movie-clipping-prep-2026-10-22.md). Brief: audience gate >= 80% US views — under = not paid. No YouTube rate exists (IG/TT only).",
  },
  {
    id: "modern-warfare-4",
    name: "Modern Warfare 4 – Campaign Moments",
    marketplace: "Whop Content Rewards",
    platformRates: {
      tiktok: { ratePer1kUSD: 1.75, minPayoutUSD: 5.25, capPerClipUSD: 1_000 },
      instagram: { ratePer1kUSD: 1.25, minPayoutUSD: 3.75, capPerClipUSD: 1_000 },
    },
    gates: [{ type: "minEngagementRate", minRate: 0.002 }],
    sourceNote:
      "Joined 2026-10-22; full brief terms recorded the same day (campaign radar baseline, Oct 22 correction section). IG/TT only — no YouTube rate exists.",
  },
  {
    id: "santa-cruz-medicinals",
    name: "Santa Cruz Medicinals Clipping",
    marketplace: "Whop Content Rewards",
    platformRates: {
      tiktok: { ratePer1kUSD: 1.0, minPayoutUSD: 5, capPerClipUSD: 200 },
      instagram: { ratePer1kUSD: 1.0, minPayoutUSD: 5, capPerClipUSD: 200 },
      youtube: { ratePer1kUSD: 1.0, minPayoutUSD: 5, capPerClipUSD: 200 },
    },
    gates: [
      { type: "minEngagementRate", minRate: 0.012 },
      { type: "minDurationSeconds", seconds: 15 },
    ],
    sourceNote:
      "Joined 2026-10-22; brief recorded the same day (campaign radar baseline, Oct 22 section): min $5 = 5,000 views to first dollar, clips >= 15s, >= 1.2% engagement.",
  },
  {
    id: "allen-stone-awareness",
    name: "Allen Stone Awareness Clipping",
    marketplace: "Whop Content Rewards",
    platformRates: {
      instagram: { ratePer1kUSD: 1.5, minPayoutUSD: 3, capPerClipUSD: 275 },
      tiktok: { ratePer1kUSD: 1.5, minPayoutUSD: 3, capPerClipUSD: 275 },
      youtube: { ratePer1kUSD: 1.5, minPayoutUSD: 3, capPerClipUSD: 275 },
    },
    gates: [{ type: "minTier1Share", minShare: 0.45 }],
    sourceNote:
      "Joined-brief terms recorded 2026-10-20 (campaign radar baseline, JOINED section): 'Tier 1 majority 45%+'. Min $3.00 at $1.50/1K = 2,000 views to first dollar. (The brief states a $1,500 budget vs Whop's $1,100 — budget figures do not affect payout math and are not encoded.)",
    unmodeledRules: [
      "Brief also sets view-scaled engagement minimums ('engagement minimums by views' in sibling briefs) without a formula in the recorded terms — not encoded.",
    ],
  },
];

export function findCampaign(id: string): CampaignRule | undefined {
  return CAMPAIGN_RULES.find((c) => c.id === id);
}
