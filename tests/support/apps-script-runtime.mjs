// Runs apps-script/Code.gs in Node against an in-memory spreadsheet that mimics the parts of
// SpreadsheetApp it uses. Lets the tests exercise the real bridge script end to end.
import { readFileSync } from "node:fs";
import vm from "node:vm";

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getDisplayValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(String(this.sheet.cells[this.row - 1 + r]?.[this.col - 1 + c] ?? ""));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.rows || values.some((v) => v.length !== this.cols)) throw new Error("setValues: size mismatch");
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) {
    this.sheet.set(this.row, this.col, v);
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name, values = []) {
    this.name = name;
    this.cells = values.map((r) => r.map(String));
  }
  set(row, col, v) {
    while (this.cells.length < row) this.cells.push([]);
    this.cells[row - 1][col - 1] = String(v);
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.cells.length - 1; i >= 0; i--) if (this.cells[i].some((c) => c !== "" && c != null)) return i + 1;
    return 0;
  }
  getLastColumn() { return this.cells.reduce((m, r) => Math.max(m, r.reduce((n, c, i) => (c !== "" && c != null ? i + 1 : n), 0)), 0); }
  getMaxRows() { return 1000; }
  getMaxColumns() { return 26; }
  getRange(row, col, rows = 1, cols = 1) {
    if (row < 1 || col < 1 || rows < 1 || cols < 1) throw new Error("Invalid range");
    return new FakeRange(this, row, col, rows, cols);
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  setFrozenRows() {}
  deleteRow(row) { this.cells.splice(row - 1, 1); }
}

class FakeSpreadsheet {
  constructor(tabs) { this.sheets = tabs.map((t) => new FakeSheet(t.title, t.values)); }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) ?? null; }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error("exists");
    const s = new FakeSheet(n);
    this.sheets.push(s);
    return s;
  }
}

export function createAppsScriptRuntime({ secret, tabs, codePath = "apps-script/Code.gs" }) {
  const spreadsheet = new FakeSpreadsheet(tabs);
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
    },
  });
  const source = readFileSync(codePath, "utf8").replace('"PASTE-THE-SECRET-HERE"', JSON.stringify(secret));
  vm.runInContext(source, context);
  return {
    spreadsheet,
    /** Same contract as the deployed web app: raw request body in, JSON text out. */
    post(body) {
      return context.doPost({ postData: { contents: body } }).content;
    },
    tab(name) {
      return spreadsheet.getSheetByName(name)?.cells ?? null;
    },
  };
}

/** The dummy Master Sheet: one Form-responses tab with the seed papers. */
export function dummySheetTabs(seed, columns) {
  const spec = columns.Submissions;
  return [{ title: "Untitled", values: [spec.map((c) => c.header), ...seed.papers.map((p) => spec.map((c) => p[c.key] ?? ""))] }];
}
