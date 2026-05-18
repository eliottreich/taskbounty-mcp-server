import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const lockfile = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as { packages?: Record<string, { version?: string }> };

function packageVersion(path: string): string {
  const version = lockfile.packages?.[path]?.version;
  assert.ok(version, `${path} must exist in package-lock.json`);
  return version;
}

function assertMinimumVersion(actual: string, minimum: string): void {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);

  for (let index = 0; index < minimumParts.length; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart > minimumPart) return;
    if (actualPart < minimumPart) {
      assert.fail(`expected ${actual} to be at least ${minimum}`);
    }
  }
}

test("lockfile pins audited transitive dependencies to patched versions", () => {
  assertMinimumVersion(packageVersion("node_modules/hono"), "4.12.18");
  assertMinimumVersion(packageVersion("node_modules/express-rate-limit"), "8.5.1");
  assertMinimumVersion(packageVersion("node_modules/ip-address"), "10.2.0");
});
