/**
 * NICOM Review Portal: Google Sheets bridge.
 *
 * Lets the portal read and write this spreadsheet without any Google Cloud setup.
 * Install (once):
 *   1. Open the Master Sheet → Extensions → Apps Script. Replace everything in Code.gs with this file.
 *   2. Put the secret you were given into SECRET below and save.
 *   3. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy and authorise.
 *   4. Copy the Web app URL (ends in /exec) into the portal's APPS_SCRIPT_URL setting.
 * Requests without the secret are refused, so the URL alone gives no access.
 * The portal never writes to the Google Form responses tab; it only adds and edits its own tabs
 * (Faculty, Assignments, Reviews, Decisions).
 */
const SECRET = "PASTE-THE-SECRET-HERE";

function doGet() {
  return ContentService.createTextOutput("NICOM bridge is running.");
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!SECRET || SECRET.indexOf("PASTE-") === 0 || req.secret !== SECRET) {
      return json_({ ok: false, error: "unauthorized" });
    }
    return json_({ ok: true, result: handle_(req) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function handle_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (req.op === "snapshot") return snapshot_(ss);

  // Writes are serialised so concurrent saves can't overwrite each other.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (req.op) {
      case "append":
        return append_(ss, req.tab, req.headers, req.rows);
      case "update":
        return update_(ss, req.tab, req.keyHeader, req.key, req.patch);
      case "delete":
        return delete_(ss, req.tab, req.keyHeader, req.key);
      case "seedIfEmpty":
        return seedIfEmpty_(ss, req.tables);
      default:
        throw new Error("Unknown operation: " + req.op);
    }
  } finally {
    lock.releaseLock();
  }
}

function snapshot_(ss) {
  return ss.getSheets().map(function (sh) {
    return { title: sh.getName(), values: sh.getDataRange().getDisplayValues() };
  });
}

/** Get (or create) a portal tab and make sure every header exists. Returns the header row. */
function ensureTab_(ss, tab, headers) {
  let sheet = ss.getSheetByName(tab);
  if (!sheet) {
    sheet = ss.insertSheet(tab);
    // Plain text everywhere, so dates, IDs and scores are stored exactly as sent.
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat("@");
    sheet.setFrozenRows(1);
  }
  const lastCol = sheet.getLastColumn();
  const current = lastCol ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  const missing = (headers || []).filter(function (h) { return current.indexOf(h) < 0; });
  if (missing.length) {
    const range = sheet.getRange(1, current.length + 1, 1, missing.length);
    range.setNumberFormat("@");
    range.setValues([missing]);
    range.setFontWeight("bold");
  }
  return { sheet: sheet, headers: current.concat(missing) };
}

function append_(ss, tab, headers, rows) {
  if (!rows || !rows.length) return 0;
  const t = ensureTab_(ss, tab, headers);
  const values = rows.map(function (r) {
    return t.headers.map(function (h) { return r[h] === undefined || r[h] === null ? "" : String(r[h]); });
  });
  const range = t.sheet.getRange(t.sheet.getLastRow() + 1, 1, values.length, t.headers.length);
  range.setNumberFormat("@");
  range.setValues(values);
  return values.length;
}

function findRow_(sheet, keyHeader, key) {
  const data = sheet.getDataRange().getDisplayValues();
  const col = data[0].indexOf(keyHeader);
  if (col < 0) throw new Error("Column not found: " + keyHeader);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]).trim() === String(key)) return i + 1; // 1-based sheet row
  }
  throw new Error(keyHeader + " " + key + " not found in " + sheet.getName());
}

function update_(ss, tab, keyHeader, key, patch) {
  const t = ensureTab_(ss, tab, Object.keys(patch || {}));
  const row = findRow_(t.sheet, keyHeader, key);
  Object.keys(patch).forEach(function (h) {
    const cell = t.sheet.getRange(row, t.headers.indexOf(h) + 1);
    cell.setNumberFormat("@");
    cell.setValue(patch[h] === undefined || patch[h] === null ? "" : String(patch[h]));
  });
  return true;
}

function delete_(ss, tab, keyHeader, key) {
  const sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error("Tab not found: " + tab);
  sheet.deleteRow(findRow_(sheet, keyHeader, key));
  return true;
}

/** Testing aid: fill portal tabs that have no data rows yet. Tabs that already have data are left alone. */
function seedIfEmpty_(ss, tables) {
  const seeded = [];
  Object.keys(tables || {}).forEach(function (tab) {
    const t = ensureTab_(ss, tab, tables[tab].headers);
    if (t.sheet.getLastRow() <= 1 && tables[tab].rows.length) {
      append_(ss, tab, tables[tab].headers, tables[tab].rows);
      seeded.push(tab);
    }
  });
  return seeded;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
