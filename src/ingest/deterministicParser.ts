/**
 * SEAM A (deterministic path) — rule-based export parser.
 *
 * Most real exports do not need an LLM: they are delimited text (CSV / TSV /
 * semicolon) or JSON arrays whose messiness is mechanical — inconsistent
 * headers ("Plays" vs "Views"), platform synonyms ("YT", "Shorts", "TT"),
 * thousands separators, "$"/"%" formatting, "45.2K" view counts, campaign
 * names instead of slugs. This parser handles that path deterministically
 * and produces a MappingReport saying exactly what was inferred and what
 * was dropped (and why) — the same contract the LLM path honors: nothing is
 * silently dropped, and nothing is guessed into a campaign or a rate.
 *
 * Routing rule (see docs/llm-parser-prompt.md): try this parser first.
 * Route to the LLM parser when headers do not resolve, campaign names do
 * not match the dataset, or the artifact is free-form text (pasted UI
 * tables without a header row, screenshot transcriptions).
 *
 * Deliberate limits: no quoted newlines inside cells; one header row;
 * campaign matching is exact-id / exact-name / unique-prefix only — a
 * campaign that matches none of those is dropped with a reason, never
 * fuzzy-guessed.
 */

import { CAMPAIGN_RULES } from "../data/campaigns.ts";
import type { CampaignRule, ClipRecord, Platform } from "../types.ts";
import type {
  ExportFormat,
  ExportParser,
  ParseResult,
  ParseWarning,
  RawExport,
} from "./exportParser.ts";

export interface DroppedRow {
  /** 1-based row in the source (header is row 1, first data row is 2). */
  row: number;
  reason: string;
  /** The raw source line / JSON fragment, verbatim. */
  raw: string;
}

export interface MappingReport {
  format: ExportFormat;
  /** Detected delimiter for delimited text ("json" for the JSON path). */
  delimiter?: string;
  /** Source header -> ClipRecord field it fed, "regionShares.<CC>", or "(ignored)". */
  headerMap: Record<string, string>;
  /** Every inference the parser made (synonyms, % conversions, suffixes…). */
  inferred: ParseWarning[];
  dropped: DroppedRow[];
}

export interface DeterministicParseResult extends ParseResult {
  mappingReport: MappingReport;
}

type FieldKey =
  | "clipId"
  | "clipperId"
  | "campaignId"
  | "platform"
  | "views"
  | "viewsInGateWindow"
  | "engagementRate"
  | "tier1Share"
  | "durationSeconds"
  | "postedAt"
  | "url";

type ColumnTarget =
  | { field: FieldKey }
  | { region: string }
  | { ignore: true };

/** Header synonyms, keyed by normalized header (lowercase, alphanumerics only). */
const HEADER_SYNONYMS: Record<string, ColumnTarget> = {
  clipid: { field: "clipId" },
  clip: { field: "clipId" },
  videoid: { field: "clipId" },
  postid: { field: "clipId" },
  submissionid: { field: "clipId" },
  id: { field: "clipId" },
  clipperid: { field: "clipperId" },
  clipper: { field: "clipperId" },
  creator: { field: "clipperId" },
  creatorid: { field: "clipperId" },
  username: { field: "clipperId" },
  handle: { field: "clipperId" },
  postedby: { field: "clipperId" },
  uploader: { field: "clipperId" },
  member: { field: "clipperId" },
  campaignid: { field: "campaignId" },
  campaign: { field: "campaignId" },
  campaignname: { field: "campaignId" },
  offer: { field: "campaignId" },
  program: { field: "campaignId" },
  platform: { field: "platform" },
  site: { field: "platform" },
  network: { field: "platform" },
  views: { field: "views" },
  view: { field: "views" },
  viewcount: { field: "views" },
  totalviews: { field: "views" },
  plays: { field: "views" },
  playcount: { field: "views" },
  impressions: { field: "views" },
  viewsinwindow: { field: "viewsInGateWindow" },
  viewsingatewindow: { field: "viewsInGateWindow" },
  windowviews: { field: "viewsInGateWindow" },
  views5d: { field: "viewsInGateWindow" },
  gatewindowviews: { field: "viewsInGateWindow" },
  viewswithin5days: { field: "viewsInGateWindow" },
  engagementrate: { field: "engagementRate" },
  engagement: { field: "engagementRate" },
  engrate: { field: "engagementRate" },
  engagementpct: { field: "engagementRate" },
  tier1share: { field: "tier1Share" },
  tier1: { field: "tier1Share" },
  tier1pct: { field: "tier1Share" },
  t1share: { field: "tier1Share" },
  durationseconds: { field: "durationSeconds" },
  duration: { field: "durationSeconds" },
  length: { field: "durationSeconds" },
  runtime: { field: "durationSeconds" },
  postedat: { field: "postedAt" },
  posted: { field: "postedAt" },
  date: { field: "postedAt" },
  postdate: { field: "postedAt" },
  dateposted: { field: "postedAt" },
  url: { field: "url" },
  link: { field: "url" },
  posturl: { field: "url" },
  videourl: { field: "url" },
  permalink: { field: "url" },
  us: { region: "US" },
  usa: { region: "US" },
  uk: { region: "UK" },
  ca: { region: "CA" },
  au: { region: "AU" },
  aus: { region: "AU" },
  other: { region: "OTHER" },
};

/** Platform synonyms, keyed by normalized value (lowercase, alphanumerics only). */
const PLATFORM_SYNONYMS: Record<string, Platform> = {
  yt: "youtube",
  youtube: "youtube",
  youtubeshorts: "youtube",
  shorts: "youtube",
  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  reels: "instagram",
  instagramreels: "instagram",
  igreels: "instagram",
  tt: "tiktok",
  tiktok: "tiktok",
  fb: "facebook",
  facebook: "facebook",
  x: "x",
  twitter: "x",
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Quote-aware single-line tokenizer for one delimiter. */
function tokenizeLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** "1,309" / "$1,240" / "45.2K" / "1.2M" -> number. Null when not numeric. */
function parseCount(raw: string): { value: number; usedSuffix: boolean } | null {
  const m = raw.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  let usedSuffix = false;
  if (m[2]) {
    n *= m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
    usedSuffix = true;
  }
  return { value: Math.round(n), usedSuffix };
}

/** "72%" / "0.72" / "72" -> fraction 0..1. Null when not numeric. */
function parseShare(raw: string): { value: number; how: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const isPercent = t.endsWith("%");
  const n = Number(t.replace(/[%$,]/g, ""));
  if (!Number.isFinite(n)) return null;
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
  if (isPercent) return { value: round6(n / 100), how: `"${t}" read as a percent` };
  if (n > 1) return { value: round6(n / 100), how: `"${t}" read as a bare percent (>1)` };
  return { value: round6(n), how: `"${t}" read as a fraction` };
}

/** "45" / "45s" / "0:38" / "1:02:03" -> seconds. Null when unparseable. */
function parseDuration(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(?:\.\d+)?s?$/i.test(t)) return Math.round(parseFloat(t));
  const parts = t.split(":").map((p) => Number(p));
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => Number.isFinite(p))) {
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return null;
}

export class DeterministicExportParser implements ExportParser {
  private readonly rules: CampaignRule[];

  constructor(rules: CampaignRule[] = CAMPAIGN_RULES) {
    this.rules = rules;
  }

  /** Exact id, exact (slugified) name, or unique prefix — never fuzzy. */
  private resolveCampaign(
    value: string,
  ): { id: string; how: string } | null {
    const slug = slugify(value);
    const byId = this.rules.find(
      (r) => r.id === value.trim() || r.id === slug,
    );
    if (byId) return { id: byId.id, how: "exact campaign id" };
    const byName = this.rules.find((r) => slugify(r.name) === slug);
    if (byName) return { id: byName.id, how: "campaign name match" };
    const prefix = this.rules.filter(
      (r) => r.id.startsWith(`${slug}-`) || slugify(r.name).startsWith(`${slug}-`),
    );
    if (prefix.length === 1) {
      return { id: prefix[0].id, how: "unique campaign prefix" };
    }
    return null;
  }

  async parse(raw: RawExport): Promise<DeterministicParseResult> {
    const warnings: ParseWarning[] = [];
    const inferred: ParseWarning[] = [];
    const unmapped: string[] = [];
    const dropped: DroppedRow[] = [];
    const seenInferences = new Set<string>();
    const noteInferred = (row: number | undefined, message: string) => {
      if (seenInferences.has(message)) return;
      seenInferences.add(message);
      const w: ParseWarning = row === undefined ? { message } : { row, message };
      inferred.push(w);
      warnings.push(w);
    };

    // ---- Normalize the source into header + string rows ----------------
    let headers: string[] = [];
    let rows: Array<{ row: number; cells: string[]; rawText: string }> = [];
    let delimiter: string | undefined;

    if (raw.format === "json") {
      delimiter = "json";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.content);
      } catch {
        throw new Error("DeterministicExportParser: format 'json' but content is not valid JSON.");
      }
      if (!Array.isArray(parsed)) {
        throw new Error("DeterministicExportParser: JSON export must be an array of row objects.");
      }
      const objects = parsed as Array<Record<string, unknown>>;
      const keySet: string[] = [];
      for (const obj of objects) {
        for (const k of Object.keys(obj)) if (!keySet.includes(k)) keySet.push(k);
      }
      headers = keySet;
      rows = objects.map((obj, i) => ({
        row: i + 1,
        cells: headers.map((h) => (obj[h] === undefined || obj[h] === null ? "" : String(obj[h]))),
        rawText: JSON.stringify(obj),
      }));
    } else {
      const lines = raw.content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        return {
          clips: [],
          warnings: [{ message: "Export is empty — no rows parsed." }],
          unmapped: [],
          mappingReport: { format: raw.format, headerMap: {}, inferred: [], dropped: [] },
        };
      }
      delimiter = detectDelimiter(lines[0]);
      headers = tokenizeLine(lines[0], delimiter);
      rows = lines.slice(1).map((line, i) => ({
        row: i + 2,
        cells: tokenizeLine(line, delimiter),
        rawText: line,
      }));
    }

    // ---- Map headers to fields ------------------------------------------
    const headerMap: Record<string, string> = {};
    const columns: Array<ColumnTarget | null> = headers.map((h) => {
      const target = HEADER_SYNONYMS[normalizeKey(h)] ?? null;
      if (!target) {
        headerMap[h] = "(ignored)";
      } else if ("region" in target) {
        headerMap[h] = `regionShares.${target.region}`;
      } else if ("field" in target) {
        headerMap[h] = target.field;
      } else {
        headerMap[h] = "(ignored)";
      }
      return target;
    });

    // ---- Map each row ----------------------------------------------------
    const clips: ClipRecord[] = [];

    for (const { row, cells, rawText } of rows) {
      const get = (field: FieldKey): string => {
        const idx = columns.findIndex((c) => c !== null && "field" in c && c.field === field);
        return idx >= 0 ? (cells[idx] ?? "") : "";
      };
      const drop = (reason: string) => {
        dropped.push({ row, reason, raw: rawText });
        unmapped.push(rawText);
        warnings.push({ row, message: `Row dropped: ${reason}` });
      };

      // Campaign (required, must resolve — never guessed).
      const campaignRaw = get("campaignId");
      if (!campaignRaw) {
        drop("missing campaign value");
        continue;
      }
      const campaign = this.resolveCampaign(campaignRaw);
      if (!campaign) {
        drop(
          `unknown campaign "${campaignRaw}" — not in the rules dataset; ` +
            `not guessed (route to the LLM parser or add the campaign)`,
        );
        continue;
      }
      if (campaign.how !== "exact campaign id") {
        noteInferred(row, `Campaign "${campaignRaw}" resolved via ${campaign.how} -> ${campaign.id}.`);
      }

      // Clipper (required).
      const clipperId = get("clipperId");
      if (!clipperId) {
        drop("missing clipper value");
        continue;
      }

      // Platform (required, synonym-normalized).
      const platformRaw = get("platform");
      if (!platformRaw) {
        drop("missing platform value");
        continue;
      }
      const platform = PLATFORM_SYNONYMS[normalizeKey(platformRaw)];
      if (!platform) {
        drop(`unrecognized platform "${platformRaw}"`);
        continue;
      }
      if (normalizeKey(platformRaw) !== platform) {
        noteInferred(row, `Platform "${platformRaw}" normalized to "${platform}".`);
      }

      // Views (required, numeric).
      const viewsRaw = get("views");
      if (!viewsRaw) {
        drop("missing views value");
        continue;
      }
      const viewsParsed = parseCount(viewsRaw);
      if (!viewsParsed) {
        drop(`views value "${viewsRaw}" is not a number`);
        continue;
      }
      if (viewsParsed.usedSuffix) {
        noteInferred(row, `Views value "${viewsRaw}" expanded from a K/M suffix to ${viewsParsed.value}.`);
      }
      if (/[$,]/.test(viewsRaw)) {
        noteInferred(row, `Views values carry "$"/thousands separators; stripped before parsing.`);
      }

      const record: ClipRecord = {
        clipId: get("clipId") || `parsed-row-${row}`,
        clipperId,
        campaignId: campaign.id,
        platform,
        views: viewsParsed.value,
      };
      if (!get("clipId")) {
        noteInferred(row, `Row ${row} has no clip id; synthesized "${record.clipId}".`);
      }

      const windowRaw = get("viewsInGateWindow");
      if (windowRaw) {
        const w = parseCount(windowRaw);
        if (w) record.viewsInGateWindow = w.value;
      }

      const engagementRaw = get("engagementRate");
      if (engagementRaw) {
        const s = parseShare(engagementRaw);
        if (s) {
          record.engagementRate = s.value;
          noteInferred(row, `Engagement ${s.how} -> rate ${s.value}.`);
        }
      }

      const tier1Raw = get("tier1Share");
      if (tier1Raw) {
        const s = parseShare(tier1Raw);
        if (s) {
          record.tier1Share = s.value;
          noteInferred(row, `Tier-1 share ${s.how} -> ${s.value}.`);
        }
      }

      const regionShares: Record<string, number> = {};
      columns.forEach((target, idx) => {
        if (target && "region" in target) {
          const s = parseShare(cells[idx] ?? "");
          if (s) regionShares[target.region] = s.value;
        }
      });
      if (Object.keys(regionShares).length > 0) record.regionShares = regionShares;

      const durationRaw = get("durationSeconds");
      if (durationRaw) {
        const d = parseDuration(durationRaw);
        if (d !== null) {
          record.durationSeconds = d;
          if (durationRaw.includes(":")) {
            noteInferred(row, `Duration "${durationRaw}" converted from mm:ss to ${d}s.`);
          }
        } else {
          warnings.push({ row, message: `Duration "${durationRaw}" unparseable — field omitted.` });
        }
      }

      const postedRaw = get("postedAt");
      if (postedRaw && /^\d{4}-\d{2}-\d{2}/.test(postedRaw)) {
        record.postedAt = postedRaw;
      }

      const url = get("url");
      if (url) record.url = url;

      clips.push(record);
    }

    return {
      clips,
      warnings,
      unmapped,
      mappingReport: {
        format: raw.format,
        delimiter,
        headerMap,
        inferred,
        dropped,
      },
    };
  }
}
