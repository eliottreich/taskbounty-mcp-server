import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages: Record<string, LockPackage | undefined>;
};

type PackageJson = {
  dependencies?: Record<string, string | undefined>;
};

const here = dirname(fileURLToPath(import.meta.url));
const packageLock = JSON.parse(
  readFileSync(join(here, "..", "package-lock.json"), "utf8"),
) as PackageLock;
const packageJson = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as PackageJson;

function lockVersion(path: string): string {
  const version = packageLock.packages[path]?.version;
  assert.ok(version, `${path} must be present in package-lock.json`);
  return version;
}

function assertVersionAtLeast(actual: string, minimum: string): void {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);

  for (let i = 0; i < 3; i += 1) {
    const actualPart = actualParts[i] ?? 0;
    const minimumPart = minimumParts[i] ?? 0;
    if (actualPart > minimumPart) {
      return;
    }
    if (actualPart < minimumPart) {
      assert.fail(`expected ${actual} to be at least ${minimum}`);
    }
  }
}

test("#17: package-lock keeps npm audit transitive dependencies on fixed versions", () => {
  assertVersionAtLeast(lockVersion("node_modules/hono"), "4.12.18");
  assertVersionAtLeast(lockVersion("node_modules/express-rate-limit"), "8.5.1");
  assertVersionAtLeast(lockVersion("node_modules/ip-address"), "10.2.0");
});

test("#17: audit fix stays on the supported MCP SDK major", () => {
  assert.equal(packageJson.dependencies?.["@modelcontextprotocol/sdk"], "^1.0.4");
  assert.equal(lockVersion("node_modules/@modelcontextprotocol/sdk").split(".")[0], "1");
});
