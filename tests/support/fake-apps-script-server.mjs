// Local stand-in for the deployed Apps Script web app, used by the e2e suite (E2E_BACKEND=appsscript).
import { readFileSync } from "node:fs";
import http from "node:http";
import { createAppsScriptRuntime, dummySheetTabs } from "./apps-script-runtime.mjs";

const port = Number(process.env.FAKE_APPS_SCRIPT_PORT || 3199);
const seed = JSON.parse(readFileSync("data/seed.json", "utf8"));
const columns = JSON.parse(readFileSync("lib/sheet-columns.json", "utf8"));
const runtime = createAppsScriptRuntime({ secret: process.env.APPS_SCRIPT_SECRET, tabs: dummySheetTabs(seed, columns) });

http
  .createServer((req, res) => {
    if (req.method === "GET") {
      if (req.url === "/__tabs") return res.end(JSON.stringify(runtime.spreadsheet.getSheets().map((s) => s.name)));
      if (req.url === "/__stats") return res.end(JSON.stringify({ calls: runtime.calls, reads: runtime.reads }));
      return res.end("NICOM bridge is running.");
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(runtime.post(body));
    });
  })
  .listen(port, () => console.log(`fake Apps Script on :${port}`));
