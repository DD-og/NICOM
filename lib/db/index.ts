import "server-only";
import { config } from "../config";
import { AppsScriptStore } from "./apps-script";
import { LocalStore } from "./local";
import { SheetsStore } from "./sheets";
import type { Store } from "./store";

const g = globalThis as unknown as { __nicomStore?: Store };

export function store(): Store {
  if (!g.__nicomStore) {
    g.__nicomStore =
      config.backend === "appsscript" ? new AppsScriptStore() : config.backend === "sheets" ? new SheetsStore() : new LocalStore();
  }
  return g.__nicomStore;
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
