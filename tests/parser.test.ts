import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CAMPAIGN_RULES } from "../src/data/campaigns.ts";
import { computePayoutLedger } from "../src/engine/payout.ts";
import { DeterministicExportParser } from "../src/ingest/deterministicParser.ts";
import type { ExportFormat } from "../src/ingest/exportParser.ts";

const parser = new DeterministicExportParser();

function fixture(name: string, format: ExportFormat) {
  const content = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return parser.parse({ format, content });
}

describe("fixture 1: messy Whop CSV (comma, quoted thousands, % columns)", () => {
  it("parses all 4 rows and maps every header", async () => {
    const res = await fixture("whop-export-messy.csv", "csv");
    assert.equal(res.clips.length, 4);
    assert.equal(res.mappingReport.dropped.length, 0);
    assert.equal(res.mappingReport.delimiter, ",");
    assert.equal(res.mappingReport.headerMap["Views"], "views");
    assert.equal(res.mappingReport.headerMap["Views in window"], "viewsInGateWindow");
    assert.equal(res.mappingReport.headerMap["Tier 1 %"], "tier1Share");
    assert.equal(res.mappingReport.headerMap["US %"], "regionShares.US");
    assert.equal(res.mappingReport.headerMap["Earnings"], "(ignored)");
  });

  it("normalizes the Sartain gate-case row (YT, '1,309', 72%)", async () => {
    const res = await fixture("whop-export-messy.csv", "csv");
    const clip = res.clips.find((c) => c.clipId === "sartain-clip-2")!;
    assert.equal(clip.campaignId, "sartain-clipping-army");
    assert.equal(clip.platform, "youtube");
    assert.equal(clip.views, 1309);
    assert.equal(clip.viewsInGateWindow, 1309);
    assert.equal(clip.tier1Share, 0.72);
  });

  it("end-to-end: the Sartain gate case prices $0 GATE_MISSED, others pay", async () => {
    const res = await fixture("whop-export-messy.csv", "csv");
    const ledger = computePayoutLedger(res.clips, CAMPAIGN_RULES);
    const byId = new Map(ledger.clips.map((p) => [p.clipId, p]));
    const sartain = byId.get("sartain-clip-2")!;
    assert.equal(sartain.payoutUSD, 0);
    assert.ok(sartain.flags.includes("GATE_MISSED"));
    assert.equal(byId.get("clash-probe-3")!.payoutUSD, 15.5);
    assert.equal(byId.get("boxed-tt-1")!.payoutUSD, 45.2);
    assert.equal(byId.get("sc-tt-1")!.payoutUSD, 6.3);
  });

  it("records inferences: name-matched campaign, platform synonyms, % reads", async () => {
    const res = await fixture("whop-export-messy.csv", "csv");
    const messages = res.mappingReport.inferred.map((w) => w.message).join("\n");
    assert.match(messages, /campaign name match/);
    assert.match(messages, /Platform "YT" normalized to "youtube"/);
    assert.match(messages, /Platform "YouTube Shorts" normalized to "youtube"/);
    assert.match(messages, /Platform "TT" normalized to "tiktok"/);
    assert.match(messages, /Tier-1 share "72%" read as a percent/);
  });
});

describe("fixture 2: pasted table (TSV, Plays/Length headers, bad rows)", () => {
  it("detects the tab delimiter and maps pasted-table headers", async () => {
    const res = await fixture("pasted-whop-table.txt", "pasted-text");
    assert.equal(res.mappingReport.delimiter, "\t");
    assert.equal(res.mappingReport.headerMap["Plays"], "views");
    assert.equal(res.mappingReport.headerMap["Posted by"], "clipperId");
    assert.equal(res.mappingReport.headerMap["Site"], "platform");
    assert.equal(res.mappingReport.headerMap["Length"], "durationSeconds");
  });

  it("parses 3 rows: K-suffix views, IG synonym, campaign prefix alias", async () => {
    const res = await fixture("pasted-whop-table.txt", "pasted-text");
    assert.equal(res.clips.length, 3);
    const juvon = res.clips.find((c) => c.clipId === "juvon-ig-1")!;
    assert.equal(juvon.views, 18500);
    assert.equal(juvon.platform, "instagram");
    assert.equal(juvon.campaignId, "juvon-clips");
    const sartain = res.clips.find((c) => c.clipId === "sartain-tt-9")!;
    assert.equal(sartain.campaignId, "sartain-clipping-army");
    const messages = res.mappingReport.inferred.map((w) => w.message).join("\n");
    assert.match(messages, /unique campaign prefix/);
    assert.match(messages, /expanded from a K\/M suffix to 18500/);
  });

  it("drops 3 rows with reasons and keeps them verbatim in unmapped", async () => {
    const res = await fixture("pasted-whop-table.txt", "pasted-text");
    assert.equal(res.mappingReport.dropped.length, 3);
    const reasons = res.mappingReport.dropped.map((d) => d.reason).join("\n");
    assert.match(reasons, /views value "N\/A" is not a number/);
    assert.match(reasons, /unknown campaign "Some Random Campaign"/);
    assert.match(reasons, /missing platform value/);
    assert.equal(res.unmapped.length, 3);
    assert.ok(res.unmapped.some((u) => u.includes("broken-row-1")));
    const broken = res.mappingReport.dropped.find((d) => d.raw.includes("broken-row-1"))!;
    assert.equal(broken.row, 5);
  });

  it("end-to-end: parsed rows price through the real engine", async () => {
    const res = await fixture("pasted-whop-table.txt", "pasted-text");
    const ledger = computePayoutLedger(res.clips, CAMPAIGN_RULES);
    const byId = new Map(ledger.clips.map((p) => [p.clipId, p]));
    assert.equal(byId.get("juvon-ig-1")!.payoutUSD, 55.5);
    const boxabl = byId.get("boxabl-batch1-1")!;
    assert.equal(boxabl.payoutUSD, 0);
    assert.ok(boxabl.flags.includes("BELOW_MINIMUM"));
    // The pasted export carries no Tier-1 demographics: Sartain's tier gate
    // is unevaluable, so the clip is flagged, not paid on a guess.
    const sartain = byId.get("sartain-tt-9")!;
    assert.equal(sartain.payoutUSD, 0);
    assert.ok(sartain.flags.includes("GATE_DATA_MISSING"));
  });
});

describe("fixture 3: semicolon export (European Excel shape)", () => {
  it("detects semicolons and parses all 3 rows", async () => {
    const res = await fixture("semicolon-export.csv", "csv");
    assert.equal(res.mappingReport.delimiter, ";");
    assert.equal(res.clips.length, 3);
    assert.equal(res.mappingReport.dropped.length, 0);
  });

  it("converts hh:mm:ss-style durations and bare 'tier1' headers", async () => {
    const res = await fixture("semicolon-export.csv", "csv");
    const mw4 = res.clips.find((c) => c.clipId === "mw4-tt-1")!;
    assert.equal(mw4.durationSeconds, 65);
    assert.equal(mw4.engagementRate, 0.0035);
    const allen = res.clips.find((c) => c.clipId === "allen-yt-1")!;
    assert.equal(allen.tier1Share, 0.38);
  });

  it("end-to-end: MW4 pays, Scape min-views gate and Allen Stone tier gate miss", async () => {
    const res = await fixture("semicolon-export.csv", "csv");
    const ledger = computePayoutLedger(res.clips, CAMPAIGN_RULES);
    const byId = new Map(ledger.clips.map((p) => [p.clipId, p]));
    assert.equal(byId.get("mw4-tt-1")!.payoutUSD, 437.5);
    assert.ok(byId.get("scape-yt-1")!.flags.includes("GATE_MISSED"));
    assert.ok(byId.get("allen-yt-1")!.flags.includes("GATE_MISSED"));
  });
});

describe("JSON exports and format edge cases", () => {
  it("parses a JSON array with the same header mapping", async () => {
    const res = await parser.parse({
      format: "json",
      content: JSON.stringify([
        { Clip: "json-1", Clipper: "clipper-a", Campaign: "boxed", Platform: "Instagram", Views: "3,210" },
      ]),
    });
    assert.equal(res.clips.length, 1);
    assert.equal(res.clips[0].campaignId, "boxed");
    assert.equal(res.clips[0].platform, "instagram");
    assert.equal(res.clips[0].views, 3210);
  });

  it("detects the delimiter when format is 'unknown'", async () => {
    const res = await parser.parse({
      format: "unknown",
      content: "clip,clipper,campaign,platform,views\nx-1,clipper-a,boxed,TT,2500\n",
    });
    assert.equal(res.mappingReport.delimiter, ",");
    assert.equal(res.clips.length, 1);
    assert.equal(res.clips[0].platform, "tiktok");
  });

  it("synthesizes a clip id when the export has none, and says so", async () => {
    const res = await parser.parse({
      format: "csv",
      content: "clipper,campaign,platform,views\nclipper-a,boxed,youtube,2500\n",
    });
    assert.equal(res.clips.length, 1);
    assert.equal(res.clips[0].clipId, "parsed-row-2");
    const messages = res.mappingReport.inferred.map((w) => w.message).join("\n");
    assert.match(messages, /synthesized "parsed-row-2"/);
  });

  it("empty export parses to zero clips with a warning, not an error", async () => {
    const res = await parser.parse({ format: "csv", content: "  \n" });
    assert.equal(res.clips.length, 0);
    assert.ok(res.warnings.length >= 1);
  });
});
