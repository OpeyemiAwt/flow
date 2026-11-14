import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const suite = process.argv[2] ?? "unit";
const tests = readdirSync("test")
  .filter((file) => {
    if (suite === "unit")
      return file.endsWith(".test.ts") || file.endsWith(".test.mjs");
    if (suite === "database") return file === "database.integration.ts";
    if (suite === "security") return file === "security.integration.mjs";
    return false;
  })
  .sort()
  .map((file) => resolve("test", file));

if (!tests.length) {
  console.error(`No tests found for suite: ${suite}`);
  process.exit(2);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
