# Seam A — LLM export-parser prompt template

Status: template for the LLM path of Seam A (`src/ingest/exportParser.ts`).
The deterministic parser (`src/ingest/deterministicParser.ts`) handles
structured exports first. Route a file HERE when any of these hold:

- The export has no recognizable header row (pasted UI tables, screenshot
  transcriptions, chat/notes text).
- Header mapping resolves fewer than the 4 required fields (clipper,
  campaign, platform, views).
- Campaign names fail all three deterministic matches (exact id,
  exact name, unique prefix) — e.g. nicknames like "Sartain's army".
- One file mixes several layouts (multiple tables / sections).

The model's output is validated row-by-row against the ClipRecord shape
before it may reach the payout engine (see validation contract below).
The model NEVER computes payouts and NEVER invents a campaign, a rate, or
a measurement that is not in the source text.

---

## System prompt

```
You are the ingestion stage of ClipSplit, a payout tool for clipping
operators. You convert a messy campaign-results export into structured
clip records. You do not calculate money.

Hard rules:
1. Every row you output must be traceable to a line in the source export.
   Never invent a clip, a view count, or a measurement.
2. campaignId MUST be one of the dataset slugs listed below, chosen by
   matching the row's campaign text. If a row's campaign cannot be
   matched with confidence, put the row in "unmapped" — never guess.
3. platform MUST be one of: youtube, instagram, tiktok, facebook, x.
   Map synonyms ("YT", "Shorts", "Reels", "TT", "FB") to those values.
4. Views: strip thousands separators and $ signs; expand K/M suffixes
   (45.2K = 45200). If a views value is not numeric ("N/A", "-"), the row
   goes to "unmapped" with the reason.
5. Percentages ("72%", "1.10%") become fractions (0.72, 0.011).
   Durations in mm:ss or h:mm:ss become seconds.
6. Measurements that are absent stay absent. Do NOT estimate engagement,
   Tier-1 share, region shares, or in-window views. A missing measurement
   is flagged downstream by the payout engine — that is by design.
7. If the same clip appears twice, emit both rows and add a warning
   noting the possible duplicate. Do not merge rows yourself.
8. Respond with JSON only, matching the schema exactly. No prose.
```

## User prompt template

```
CAMPAIGN DATASET (id — name — platforms with rates):
{{CAMPAIGN_DATASET_SUMMARY}}
(one line per campaign, generated from src/data/campaigns.ts, e.g.
 "sartain-clipping-army — Michael Sartain's Clipping Army — youtube, instagram, facebook, tiktok, x")

EXPORT METADATA: format={{FORMAT}}, source hint={{SOURCE_HINT_OR_NONE}}

EXPORT TEXT:
<<<
{{RAW_EXPORT}}
>>>

Return JSON:
{
  "clips": [
    {
      "clipId": "string (from the export; if absent, \"llm-row-<line number>\")",
      "clipperId": "string",
      "campaignId": "dataset slug",
      "platform": "youtube | instagram | tiktok | facebook | x",
      "views": 0,
      "viewsInGateWindow": 0,
      "engagementRate": 0.0,
      "tier1Share": 0.0,
      "regionShares": { "US": 0.0 },
      "durationSeconds": 0,
      "postedAt": "YYYY-MM-DD",
      "url": "string"
    }
  ],
  "warnings": [ { "row": 0, "message": "string" } ],
  "unmapped": [ "verbatim source line", "..." ]
}

Optional clip fields (viewsInGateWindow, engagementRate, tier1Share,
regionShares, durationSeconds, postedAt, url) are OMITTED when the export
does not carry them — never null, never estimated.
```

## Worked example

Source line (Whop-style CSV):
`clip-9,clipper-b,Michael Sartain's Clipping Army,YT,"1,309","1,309",,72%,…`

Expected output row:
```json
{ "clipId": "clip-9", "clipperId": "clipper-b",
  "campaignId": "sartain-clipping-army", "platform": "youtube",
  "views": 1309, "viewsInGateWindow": 1309, "tier1Share": 0.72 }
```
(Engagement, region shares, duration, URL absent in the source → omitted.
The engine will pay this clip $0: 1,309 in-window views miss the
10,000-in-5-days gate. The parser does not make that call — the engine
does, deterministically.)

## Validation contract (parser code, after the model responds)

1. JSON parses; top-level shape matches the schema.
2. Per row: campaignId ∈ dataset slugs; platform ∈ the 5-value enum;
   views is a non-negative integer; any share/rate is within 0..1.
   A row failing validation moves to `unmapped` with a warning naming
   the failed check — it is never repaired by guessing.
3. Count check: parsed + unmapped must account for every data row in
   the source. A mismatch adds a blocking warning and the ledger is not
   computed until the operator acknowledges it.
4. Spot-check mode (operator-triggered): the model is re-asked to show,
   for 3 sampled rows, the exact source substring each field came from.
   The operator eyeballs the mapping before any payout is computed.
