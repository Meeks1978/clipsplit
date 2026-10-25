/* ClipSplit demo console — renders window.CLIPSPLIT_DATA (from data.js).
   Uses AG Grid when the CDN load succeeded; falls back to plain tables.
   No fetch, no network calls, no money movement: display + preview only. */
(function () {
  "use strict";
  var data = window.CLIPSPLIT_DATA;
  var statsEl = document.getElementById("stats");
  if (!data) {
    statsEl.textContent = "data.js failed to load — run `npm run ui` to regenerate it.";
    return;
  }

  var fmtUSD = function (v) {
    return v === null || v === undefined ? "—" : "$" + Number(v).toFixed(2);
  };
  var fmtNum = function (v) {
    return Number(v).toLocaleString("en-US");
  };
  var fmtFlags = function (flags) {
    return flags && flags.length ? flags.join(", ") : "—";
  };
  var fmtFlagCounts = function (counts) {
    var parts = Object.keys(counts || {}).map(function (k) {
      return k + " ×" + counts[k];
    });
    return parts.length ? parts.join("; ") : "—";
  };

  statsEl.textContent =
    data.totals.clipCount + " clips · " +
    data.totals.payableClipCount + " payable · " +
    fmtUSD(data.totals.totalPayoutUSD) + " payable of " +
    fmtUSD(data.totals.totalGrossUSD) + " gross · rules dataset: " +
    data.campaignRules + " campaigns";

  var hasAgGrid =
    typeof window.agGrid !== "undefined" &&
    typeof window.agGrid.createGrid === "function";

  function renderGrid(el, columnDefs, rows) {
    if (hasAgGrid) {
      window.agGrid.createGrid(el, {
        columnDefs: columnDefs,
        rowData: rows,
        defaultColDef: { sortable: true, resizable: true, filter: true },
        animateRows: true,
      });
    } else {
      el.classList.remove("ag-theme-quartz");
      renderFallbackTable(el, columnDefs, rows);
    }
  }

  function renderFallbackTable(el, columnDefs, rows) {
    var table = document.createElement("table");
    table.className = "fallback";
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    columnDefs.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col.headerName || col.field;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      columnDefs.forEach(function (col) {
        var td = document.createElement("td");
        var value = row[col.field];
        if (typeof col.valueFormatter === "function") {
          td.textContent = col.valueFormatter({ value: value });
        } else if (Array.isArray(value)) {
          td.textContent = value.join(", ");
        } else {
          td.textContent = value === null || value === undefined ? "—" : String(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    el.appendChild(table);
    var note = document.createElement("p");
    note.className = "hint";
    note.textContent = "(AG Grid CDN unreachable — fallback table, same data.)";
    el.appendChild(note);
  }

  /* ---- 1 · Ledger grid ---- */
  renderGrid(document.getElementById("ledgerGrid"), [
    { field: "clipId", headerName: "Clip", minWidth: 130 },
    { field: "clipperId", headerName: "Clipper", minWidth: 100 },
    { field: "campaignName", headerName: "Campaign", minWidth: 210 },
    { field: "platform", headerName: "Platform", width: 105 },
    { field: "views", headerName: "Views", width: 95, valueFormatter: function (p) { return fmtNum(p.value); } },
    { field: "gateStatus", headerName: "Gate status", width: 135 },
    { field: "ratePer1kUSD", headerName: "Rate $/1K", width: 95, valueFormatter: function (p) { return p.value === null || p.value === undefined ? "—" : "$" + Number(p.value).toFixed(2); } },
    { field: "grossUSD", headerName: "Gross", width: 90, valueFormatter: function (p) { return fmtUSD(p.value); } },
    { field: "payoutUSD", headerName: "Payout", width: 90, valueFormatter: function (p) { return fmtUSD(p.value); } },
    { field: "flags", headerName: "Flags", minWidth: 150, valueFormatter: function (p) { return fmtFlags(p.value); } },
  ], data.ledgerRows);

  /* ---- 2 · Per-clipper summary ---- */
  renderGrid(document.getElementById("summaryGrid"), [
    { field: "clipperId", headerName: "Clipper", minWidth: 110 },
    { field: "clipCount", headerName: "Clips", width: 70 },
    { field: "payableClipCount", headerName: "Payable", width: 85 },
    { field: "totalGrossUSD", headerName: "Gross", width: 90, valueFormatter: function (p) { return fmtUSD(p.value); } },
    { field: "totalPayoutUSD", headerName: "Payout", width: 90, valueFormatter: function (p) { return fmtUSD(p.value); } },
    { field: "flagCounts", headerName: "Flags", minWidth: 150, valueFormatter: function (p) { return fmtFlagCounts(p.value); } },
  ], data.perClipper);

  /* ---- 2b · Anomaly panel ---- */
  var anomalyList = document.getElementById("anomalyList");
  if (!data.anomalies.length) {
    var li = document.createElement("li");
    li.textContent = "No anomalies in this ledger.";
    anomalyList.appendChild(li);
  } else {
    data.anomalies.forEach(function (a) {
      var item = document.createElement("li");
      var head = document.createElement("strong");
      head.textContent = a.clipId + " ";
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = a.flags.join(", ");
      var body = document.createElement("span");
      body.textContent = " — " + a.explanation;
      item.appendChild(head);
      item.appendChild(chip);
      item.appendChild(body);
      anomalyList.appendChild(item);
    });
  }

  /* ---- 3 · Batch preview ---- */
  var preview = data.batchPreview;
  var summaryEl = document.getElementById("batchSummary");
  summaryEl.textContent =
    "Ready to preview: " + preview.items.length + " payout item(s), " +
    fmtUSD(preview.totalAmountUSD) + " total, " + preview.skipped.length +
    " clipper(s) skipped. sender_batch_id: " + preview.senderBatchId;

  document.getElementById("runBatchBtn").addEventListener("click", function () {
    document.getElementById("batchJson").textContent =
      JSON.stringify(preview.payload, null, 2);

    var wrap = document.getElementById("batchItems");
    wrap.innerHTML = "";
    var table = document.createElement("table");
    table.className = "fallback";
    var head = document.createElement("tr");
    ["sender_item_id", "receiver", "amount", "note"].forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      head.appendChild(th);
    });
    table.appendChild(head);
    preview.items.forEach(function (item) {
      var tr = document.createElement("tr");
      [item.senderItemId,
       item.receiverEmail + (item.receiverIsPlaceholder ? " (placeholder)" : ""),
       fmtUSD(item.amountUSD),
       item.note].forEach(function (cell) {
        var td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);

    var skippedList = document.getElementById("batchSkipped");
    skippedList.innerHTML = "";
    preview.skipped.forEach(function (s) {
      var li = document.createElement("li");
      li.textContent = "Skipped " + s.clipperId + ": " + s.reason;
      skippedList.appendChild(li);
    });

    summaryEl.textContent =
      "SANDBOX PREVIEW rendered — no batch was created and no request left " +
      "this page. " + preview.items.length + " item(s), " +
      fmtUSD(preview.totalAmountUSD) + " total.";
  });
})();
