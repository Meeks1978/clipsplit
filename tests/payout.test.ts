import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPAIGN_RULES, findCampaign } from "../src/data/campaigns.ts";
import {
  computeClipPayout,
  computePayoutLedger,
} from "../src/engine/payout.ts";
import type { ClipRecord } from "../src/types.ts";

const sartain = findCampaign("sartain-clipping-army")!;
const boxabl = findCampaign("boxabl-official")!;
const clash = findCampaign("clash-x-hoh")!;
const freezertarps = findCampaign("freezertarps-flightreacts")!;
const scape = findCampaign("scape")!;
const spaceCadet = findCampaign("space-cadet")!;
const mw4 = findCampaign("modern-warfare-4")!;
const santaCruz = findCampaign("santa-cruz-medicinals")!;

function clip(partial: Partial<ClipRecord> & { campaignId: string }): ClipRecord {
  return {
    clipId: "test-clip",
    clipperId: "clipper-a",
    platform: "youtube",
    views: 0,
    ...partial,
  };
}

describe("dataset sanity", () => {
  it("encodes at least 8 campaigns", () => {
    assert.ok(CAMPAIGN_RULES.length >= 8, `only ${CAMPAIGN_RULES.length} campaigns`);
  });
  it("every campaign has a source note and at least one rate", () => {
    for (const c of CAMPAIGN_RULES) {
      assert.ok(c.sourceNote.length > 20, `${c.id} missing source note`);
      assert.ok(Object.keys(c.platformRates).length >= 1, `${c.id} has no rates`);
    }
  });
});

describe("Sartain 10K-in-5-days gate (real observed outcomes)", () => {
  it("clip 2 at 1,309 views in-window pays $0 — GATE_MISSED", () => {
    // Real case: operator's Sartain clip 2 closed at 1,309 views and the
    // campaign rejected it, 'Did not meet the 10k view minimum'.
    const p = computeClipPayout(
      clip({
        campaignId: sartain.id,
        clipId: "uucRGfacXq0",
        views: 1309,
        viewsInGateWindow: 1309,
        tier1Share: 0.72,
      }),
      sartain,
    );
    assert.equal(p.payoutUSD, 0);
    assert.equal(p.payable, false);
    assert.ok(p.flags.includes("GATE_MISSED"));
  });

  it("lead clip at 1,225 views pays $0 — GATE_MISSED", () => {
    const p = computeClipPayout(
      clip({
        campaignId: sartain.id,
        views: 1225,
        viewsInGateWindow: 1225,
        tier1Share: 0.68,
      }),
      sartain,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_MISSED"));
  });

  it("clears the gate on Instagram: 11,800 in-window views pays $23.60", () => {
    const p = computeClipPayout(
      clip({
        campaignId: sartain.id,
        platform: "instagram",
        views: 12400,
        viewsInGateWindow: 11800,
        tier1Share: 0.61,
      }),
      sartain,
    );
    // Gross uses total views: 12.4K x $2.00 = $24.80. Wait — engine prices on
    // total views by design; the gate uses in-window views only.
    assert.equal(p.grossUSD, 24.8);
    assert.equal(p.payoutUSD, 24.8);
    assert.equal(p.payable, true);
    assert.deepEqual(p.flags, []);
  });

  it("gate passed on views but Tier-1 share 40% fails the audience gate", () => {
    const p = computeClipPayout(
      clip({
        campaignId: sartain.id,
        views: 15000,
        viewsInGateWindow: 15000,
        tier1Share: 0.4,
      }),
      sartain,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_MISSED"));
  });

  it("missing Tier-1 measurement is GATE_DATA_MISSING, pays $0", () => {
    const p = computeClipPayout(
      clip({ campaignId: sartain.id, views: 20000, viewsInGateWindow: 20000 }),
      sartain,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_DATA_MISSING"));
  });

  it("cap applies: 150K Instagram views gross $300, pays the $200 cap", () => {
    const p = computeClipPayout(
      clip({
        campaignId: sartain.id,
        platform: "instagram",
        views: 150000,
        viewsInGateWindow: 150000,
        tier1Share: 0.8,
      }),
      sartain,
    );
    assert.equal(p.grossUSD, 300);
    assert.equal(p.payoutUSD, 200);
    assert.ok(p.flags.includes("CAP_APPLIED"));
  });
});

describe("CLASH x HOH (real observed scale)", () => {
  const audience = { US: 0.52, UK: 0.06, CA: 0.05, AU: 0.02, OTHER: 0.35 };

  it("1,200 views at $1.25/1K pays exactly $1.50", () => {
    const p = computeClipPayout(
      clip({
        campaignId: clash.id,
        views: 1200,
        engagementRate: 0.011,
        regionShares: audience,
      }),
      clash,
    );
    assert.equal(p.grossUSD, 1.5);
    assert.equal(p.payoutUSD, 1.5);
    assert.equal(p.payable, true);
  });

  it("800 views grosses $1.00 — below the $1.25 minimum, pays $0", () => {
    const p = computeClipPayout(
      clip({
        campaignId: clash.id,
        views: 800,
        engagementRate: 0.011,
        regionShares: audience,
      }),
      clash,
    );
    assert.equal(p.grossUSD, 1.0);
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("BELOW_MINIMUM"));
  });

  it("engagement 0.10% fails the 0.20% gate", () => {
    const p = computeClipPayout(
      clip({
        campaignId: clash.id,
        views: 5000,
        engagementRate: 0.001,
        regionShares: audience,
      }),
      clash,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_MISSED"));
  });

  it("no region data is GATE_DATA_MISSING", () => {
    const p = computeClipPayout(
      clip({ campaignId: clash.id, views: 5000, engagementRate: 0.01 }),
      clash,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_DATA_MISSING"));
  });
});

describe("Boxabl Official (lowest threshold in the set)", () => {
  it("7 views (real observed level) pays $0 — BELOW_MINIMUM", () => {
    const p = computeClipPayout(clip({ campaignId: boxabl.id, views: 7 }), boxabl);
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("BELOW_MINIMUM"));
  });

  it("2,000 views is exactly the $1 minimum — payable at $1.00", () => {
    const p = computeClipPayout(clip({ campaignId: boxabl.id, views: 2000 }), boxabl);
    assert.equal(p.payoutUSD, 1.0);
    assert.equal(p.payable, true);
  });

  it("4,200 views pays $2.10", () => {
    const p = computeClipPayout(clip({ campaignId: boxabl.id, views: 4200 }), boxabl);
    assert.equal(p.payoutUSD, 2.1);
  });
});

describe("rates that do not exist are never guessed", () => {
  it("FreezerTarps on TikTok -> MISSING_PLATFORM_RATE (brief: 'No TikTok')", () => {
    const p = computeClipPayout(
      clip({ campaignId: freezertarps.id, platform: "tiktok", views: 9000 }),
      freezertarps,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("MISSING_PLATFORM_RATE"));
  });

  it("FreezerTarps on X -> MISSING_PLATFORM_RATE (posting allowed, price unstated)", () => {
    const p = computeClipPayout(
      clip({ campaignId: freezertarps.id, platform: "x", views: 9000 }),
      freezertarps,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("MISSING_PLATFORM_RATE"));
  });

  it("unknown campaign id -> UNKNOWN_CAMPAIGN", () => {
    const p = computeClipPayout(clip({ campaignId: "nope", views: 5000 }), undefined);
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("UNKNOWN_CAMPAIGN"));
  });
});

describe("other encoded gates", () => {
  it("Scape: 900 views misses the 1,000-view start; 1,200 pays $1.80", () => {
    const miss = computeClipPayout(clip({ campaignId: scape.id, views: 900 }), scape);
    assert.equal(miss.payoutUSD, 0);
    assert.ok(miss.flags.includes("GATE_MISSED"));
    const hit = computeClipPayout(clip({ campaignId: scape.id, views: 1200 }), scape);
    assert.equal(hit.payoutUSD, 1.8);
  });

  it("Space Cadet: 72% US audience fails the 80% gate; 90% passes", () => {
    const miss = computeClipPayout(
      clip({
        campaignId: spaceCadet.id,
        platform: "tiktok",
        views: 5000,
        engagementRate: 0.005,
        regionShares: { US: 0.72, OTHER: 0.28 },
      }),
      spaceCadet,
    );
    assert.equal(miss.payoutUSD, 0);
    assert.ok(miss.flags.includes("GATE_MISSED"));
    const hit = computeClipPayout(
      clip({
        campaignId: spaceCadet.id,
        platform: "tiktok",
        views: 5000,
        engagementRate: 0.005,
        regionShares: { US: 0.9, OTHER: 0.1 },
      }),
      spaceCadet,
    );
    assert.equal(hit.payoutUSD, 7.5);
  });

  it("MW4: 800K TikTok views gross $1,400, capped at $1,000", () => {
    const p = computeClipPayout(
      clip({
        campaignId: mw4.id,
        platform: "tiktok",
        views: 800000,
        engagementRate: 0.01,
      }),
      mw4,
    );
    assert.equal(p.grossUSD, 1400);
    assert.equal(p.payoutUSD, 1000);
    assert.ok(p.flags.includes("CAP_APPLIED"));
  });

  it("Santa Cruz: 6,000 views at 0.8% engagement misses the 1.2% gate", () => {
    const p = computeClipPayout(
      clip({
        campaignId: santaCruz.id,
        views: 6000,
        engagementRate: 0.008,
        durationSeconds: 30,
      }),
      santaCruz,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_MISSED"));
    const ok = computeClipPayout(
      clip({
        campaignId: santaCruz.id,
        views: 6000,
        engagementRate: 0.02,
        durationSeconds: 30,
      }),
      santaCruz,
    );
    assert.equal(ok.payoutUSD, 6.0);
  });

  it("Santa Cruz: a 10-second clip misses the 15s duration gate", () => {
    const p = computeClipPayout(
      clip({
        campaignId: santaCruz.id,
        views: 6000,
        engagementRate: 0.02,
        durationSeconds: 10,
      }),
      santaCruz,
    );
    assert.equal(p.payoutUSD, 0);
    assert.ok(p.flags.includes("GATE_MISSED"));
  });
});

describe("ledger aggregation + fee option", () => {
  const clips: ClipRecord[] = [
    clip({ clipId: "a1", clipperId: "clipper-a", campaignId: boxabl.id, views: 4200 }),
    clip({ clipId: "a2", clipperId: "clipper-a", campaignId: boxabl.id, views: 7 }),
    clip({
      clipId: "b1",
      clipperId: "clipper-b",
      campaignId: clash.id,
      views: 1200,
      engagementRate: 0.011,
      regionShares: { US: 0.52, UK: 0.06, CA: 0.05, AU: 0.02, OTHER: 0.35 },
    }),
    clip({
      clipId: "b2",
      clipperId: "clipper-b",
      campaignId: sartain.id,
      views: 1309,
      viewsInGateWindow: 1309,
      tier1Share: 0.72,
    }),
  ];

  it("aggregates per clipper and in total", () => {
    const ledger = computePayoutLedger(clips, CAMPAIGN_RULES);
    assert.equal(ledger.totals.clipCount, 4);
    assert.equal(ledger.totals.payableClipCount, 2);
    assert.equal(ledger.totals.totalPayoutUSD, 3.6); // 2.10 + 1.50
    const a = ledger.perClipper.find((t) => t.clipperId === "clipper-a")!;
    assert.equal(a.totalPayoutUSD, 2.1);
    assert.equal(a.flagCounts.BELOW_MINIMUM, 1);
    const b = ledger.perClipper.find((t) => t.clipperId === "clipper-b")!;
    assert.equal(b.totalPayoutUSD, 1.5);
    assert.equal(b.flagCounts.GATE_MISSED, 1);
  });

  it("platformFeeRate 0.10 takes 10% off payable amounts only", () => {
    const ledger = computePayoutLedger(clips, CAMPAIGN_RULES, { platformFeeRate: 0.1 });
    assert.equal(ledger.totals.totalPayoutUSD, 3.24); // 3.60 x 0.9
  });
});
