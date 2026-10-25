/**
 * ClipSplit payout engine — pure functions, no I/O, no globals mutated.
 *
 * computePayoutLedger(clips, rules, options) -> PayoutLedger
 *
 * Evaluation order per clip (first failure wins; the clip pays $0):
 *   1. Campaign known?            -> UNKNOWN_CAMPAIGN
 *   2. Platform rate exists?       -> MISSING_PLATFORM_RATE
 *   3. Gates (in dataset order):
 *        measurement missing     -> GATE_DATA_MISSING
 *        measurement below gate  -> GATE_MISSED
 *   4. gross = views / 1000 * ratePer1k
 *        gross < minPayout       -> BELOW_MINIMUM (pays $0)
 *        gross > capPerClip      -> CAP_APPLIED (pays the cap)
 *   5. Optional marketplace fee (options.platformFeeRate, default 0) is
 *      applied to the payable amount last.
 *
 * Notes on judgement calls (also in BUILDLOG.md):
 * - viewWindow gates use clip.viewsInGateWindow when supplied, else total
 *   views. Operators reading a campaign at window close have total ~ window
 *   views; an export that keeps accruing views past the window MUST supply
 *   viewsInGateWindow for a correct result.
 * - A below-minimum clip pays $0. Briefs state dollar minimums without
 *   saying whether sub-minimum earnings bank toward a later payout; the
 *   operator's observed outcomes (Sartain rejections at gate miss) match
 *   the pay-$0 reading.
 * - Money is rounded to cents on gross and on the final payout.
 */

import type {
  AnomalyFlag,
  CampaignGate,
  CampaignRule,
  ClipPayout,
  ClipRecord,
  ClipperTotals,
  PayoutEngineOptions,
  PayoutLedger,
} from "../types.ts";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface GateOutcome {
  passed: boolean;
  flag?: AnomalyFlag;
  note?: string;
}

function evaluateGate(gate: CampaignGate, clip: ClipRecord): GateOutcome {
  switch (gate.type) {
    case "viewWindow": {
      const windowViews = clip.viewsInGateWindow ?? clip.views;
      const basis =
        clip.viewsInGateWindow === undefined
          ? "total views (no in-window count supplied)"
          : "in-window views";
      if (windowViews >= gate.minViews) {
        return {
          passed: true,
          note: `Gate passed: ${windowViews} ${basis} >= ${gate.minViews} within ${gate.withinDays} days.`,
        };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: ${windowViews} ${basis} < ${gate.minViews} required within ${gate.withinDays} days.`,
      };
    }
    case "minViews": {
      if (clip.views >= gate.minViews) {
        return { passed: true, note: `Gate passed: ${clip.views} views >= ${gate.minViews}.` };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: ${clip.views} views < ${gate.minViews} minimum.`,
      };
    }
    case "minEngagementRate": {
      if (clip.engagementRate === undefined) {
        return {
          passed: false,
          flag: "GATE_DATA_MISSING",
          note: `Gate not evaluable: engagement rate missing (campaign requires >= ${(gate.minRate * 100).toFixed(2)}%).`,
        };
      }
      if (clip.engagementRate >= gate.minRate) {
        return {
          passed: true,
          note: `Gate passed: engagement ${(clip.engagementRate * 100).toFixed(2)}% >= ${(gate.minRate * 100).toFixed(2)}%.`,
        };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: engagement ${(clip.engagementRate * 100).toFixed(2)}% < ${(gate.minRate * 100).toFixed(2)}% required.`,
      };
    }
    case "minRegionShare": {
      if (clip.regionShares === undefined) {
        return {
          passed: false,
          flag: "GATE_DATA_MISSING",
          note: `Gate not evaluable: audience region shares missing (campaign requires >= ${(gate.minShare * 100).toFixed(0)}% from ${gate.regions.join("/")}).`,
        };
      }
      const share = gate.regions.reduce(
        (sum, region) => sum + (clip.regionShares?.[region] ?? 0),
        0,
      );
      if (share >= gate.minShare) {
        return {
          passed: true,
          note: `Gate passed: ${(share * 100).toFixed(1)}% audience from ${gate.regions.join("/")} >= ${(gate.minShare * 100).toFixed(0)}%.`,
        };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: ${(share * 100).toFixed(1)}% audience from ${gate.regions.join("/")} < ${(gate.minShare * 100).toFixed(0)}% required.`,
      };
    }
    case "minTier1Share": {
      if (clip.tier1Share === undefined) {
        return {
          passed: false,
          flag: "GATE_DATA_MISSING",
          note: `Gate not evaluable: Tier-1 audience share missing (campaign requires >= ${(gate.minShare * 100).toFixed(0)}%).`,
        };
      }
      if (clip.tier1Share >= gate.minShare) {
        return {
          passed: true,
          note: `Gate passed: Tier-1 share ${(clip.tier1Share * 100).toFixed(1)}% >= ${(gate.minShare * 100).toFixed(0)}%.`,
        };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: Tier-1 share ${(clip.tier1Share * 100).toFixed(1)}% < ${(gate.minShare * 100).toFixed(0)}% required.`,
      };
    }
    case "minDurationSeconds": {
      if (clip.durationSeconds === undefined) {
        return {
          passed: false,
          flag: "GATE_DATA_MISSING",
          note: `Gate not evaluable: clip duration missing (campaign requires >= ${gate.seconds}s).`,
        };
      }
      if (clip.durationSeconds >= gate.seconds) {
        return { passed: true, note: `Gate passed: duration ${clip.durationSeconds}s >= ${gate.seconds}s.` };
      }
      return {
        passed: false,
        flag: "GATE_MISSED",
        note: `Gate missed: duration ${clip.durationSeconds}s < ${gate.seconds}s minimum.`,
      };
    }
  }
}

export function computeClipPayout(
  clip: ClipRecord,
  rule: CampaignRule | undefined,
  options: PayoutEngineOptions = {},
): ClipPayout {
  const base: ClipPayout = {
    clipId: clip.clipId,
    clipperId: clip.clipperId,
    campaignId: clip.campaignId,
    platform: clip.platform,
    views: clip.views,
    ratePer1kUSD: null,
    grossUSD: 0,
    payoutUSD: 0,
    payable: false,
    flags: [],
    notes: [],
  };

  if (!rule) {
    base.flags.push("UNKNOWN_CAMPAIGN");
    base.notes.push(`No campaign rule with id "${clip.campaignId}" in the dataset.`);
    return base;
  }

  const rate = rule.platformRates[clip.platform];
  if (!rate) {
    base.flags.push("MISSING_PLATFORM_RATE");
    base.notes.push(
      `Campaign "${rule.name}" states no rate for platform "${clip.platform}". Not guessed — add the rate to the dataset from the campaign brief.`,
    );
    return base;
  }
  base.ratePer1kUSD = rate.ratePer1kUSD;

  const gross = round2((clip.views / 1000) * rate.ratePer1kUSD);
  base.grossUSD = gross;

  for (const gate of rule.gates) {
    const outcome = evaluateGate(gate, clip);
    if (outcome.note) base.notes.push(outcome.note);
    if (!outcome.passed) {
      if (outcome.flag) base.flags.push(outcome.flag);
      base.notes.push("Payout $0.00 — gate not satisfied.");
      return base;
    }
  }

  if (gross < rate.minPayoutUSD) {
    base.flags.push("BELOW_MINIMUM");
    base.notes.push(
      `Gross $${gross.toFixed(2)} is below the campaign minimum payout of $${rate.minPayoutUSD.toFixed(2)} — pays $0.00.`,
    );
    return base;
  }

  let payable = gross;
  if (gross > rate.capPerClipUSD) {
    payable = rate.capPerClipUSD;
    base.flags.push("CAP_APPLIED");
    base.notes.push(
      `Gross $${gross.toFixed(2)} exceeds the per-clip cap of $${rate.capPerClipUSD.toFixed(2)} — pays the cap.`,
    );
  }

  const feeRate = options.platformFeeRate ?? 0;
  if (feeRate > 0) {
    payable = round2(payable * (1 - feeRate));
    base.notes.push(`Marketplace fee of ${(feeRate * 100).toFixed(1)}% applied.`);
  }

  base.payoutUSD = round2(payable);
  base.payable = base.payoutUSD > 0;
  if (base.payable && base.notes.length === 0) {
    base.notes.push(`Payable: ${clip.views} views x $${rate.ratePer1kUSD.toFixed(2)}/1K = $${base.payoutUSD.toFixed(2)}.`);
  }
  if (rule.manualReview) {
    base.notes.push(
      "Campaign pays on human-reviewed 'qualified views' — this figure is the by-the-numbers amount, subject to that review.",
    );
  }
  return base;
}

export function computePayoutLedger(
  clips: ClipRecord[],
  rules: CampaignRule[],
  options: PayoutEngineOptions = {},
): PayoutLedger {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const clipPayouts = clips.map((clip) =>
    computeClipPayout(clip, byId.get(clip.campaignId), options),
  );

  const perClipperMap = new Map<string, ClipperTotals>();
  for (const p of clipPayouts) {
    let totals = perClipperMap.get(p.clipperId);
    if (!totals) {
      totals = {
        clipperId: p.clipperId,
        clipCount: 0,
        payableClipCount: 0,
        totalGrossUSD: 0,
        totalPayoutUSD: 0,
        flagCounts: {},
      };
      perClipperMap.set(p.clipperId, totals);
    }
    totals.clipCount += 1;
    if (p.payable) totals.payableClipCount += 1;
    totals.totalGrossUSD = round2(totals.totalGrossUSD + p.grossUSD);
    totals.totalPayoutUSD = round2(totals.totalPayoutUSD + p.payoutUSD);
    for (const flag of p.flags) {
      totals.flagCounts[flag] = (totals.flagCounts[flag] ?? 0) + 1;
    }
  }

  const perClipper = [...perClipperMap.values()].sort((a, b) =>
    a.clipperId.localeCompare(b.clipperId),
  );

  return {
    clips: clipPayouts,
    perClipper,
    totals: {
      clipCount: clipPayouts.length,
      payableClipCount: clipPayouts.filter((p) => p.payable).length,
      totalGrossUSD: round2(clipPayouts.reduce((s, p) => s + p.grossUSD, 0)),
      totalPayoutUSD: round2(clipPayouts.reduce((s, p) => s + p.payoutUSD, 0)),
    },
  };
}
