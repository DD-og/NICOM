// Copy of data/seed.json where every account's password is TEST_PASSWORD (the real ones stay private).
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const TEST_PASSWORD = "e2e-Test-Pass-2026";
const hash = (pw) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
};
const seed = JSON.parse(readFileSync("data/seed.json", "utf8"));
const one = hash(TEST_PASSWORD);
seed.faculty = seed.faculty.map((f) => ({ ...f, passwordHash: one }));
writeFileSync(".e2e-seed.json", JSON.stringify(seed));
