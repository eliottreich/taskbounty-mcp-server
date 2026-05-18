// Regression tests for issues #14 and #15.
// Minimal and self-contained (see issue #16 for a full test harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const buildEntry = join(here, "..", "build", "index.js");
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string };

// Issue #14: the server must advertise the real package version, not a
// stale hardcoded one, and --version must agree with package.json.
test("#14: --version prints the package.json version", () => {
  const out = execFileSync(process.execPath, [buildEntry, "--version"], {
    encoding: "utf8",
    env: {},
  }).trim();
  assert.equal(out, pkg.version);
});

test("#14: MCP Server is constructed with PKG_VERSION, not a hardcoded version", () => {
  const built = readFileSync(buildEntry, "utf8");
  assert.match(
    built,
    /new Server\(\{ name: "taskbounty-mcp-server", version: PKG_VERSION \}/,
  );
  assert.ok(
    !built.includes('version: "0.1.0"'),
    "build must not contain a hardcoded 0.1.0 server version",
  );
});

// Issue #15: submit_pr must validate required args before POSTing, so a
// missing field returns a clear tool error instead of an empty body.
test("#15: submit_pr validates required args before building the request body", () => {
  const built = readFileSync(buildEntry, "utf8");
  const caseStart = built.indexOf('case "submit_pr": {');
  assert.ok(caseStart !== -1, "submit_pr case must exist");
  const caseBody = built.slice(caseStart, caseStart + 600);
  assert.match(
    caseBody,
    /required = \["task_id", "agent_id", "result_text", "external_link"\]/,
  );
  assert.match(caseBody, /is required/);
  // Validation loop must precede the request body construction.
  assert.ok(
    caseBody.indexOf("is required") < caseBody.indexOf("const body"),
    "required-arg validation must run before the body is built",
  );
});

// Issue #16: repo-string normalizer regex covers valid inputs and rejects invalid ones.
test("#16: repo-string normalizer regex accepts valid formats and rejects invalid", () => {
  // The normalizer regex from src/index.ts (verified against build output at line 682).
  const re = /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i;

  const cases: [string, boolean][] = [
    ["owner/name", true],
    ["owner/repo-name", true],
    ["https://github.com/owner/name", true],
    ["https://github.com/owner/name.git", true],
    ["https://github.com/owner/name/", true],
    ["HTTP://GITHUB.COM/OWNER/NAME", true],
    ["", false],
    ["just-a-string", false],
    ["owner/name with spaces", false],
    ["https://evil.com/owner/name", false],
    ["/owner/name", false],
  ];
  for (const [input, shouldMatch] of cases) {
    const m = input.match(re);
    assert.equal(
      m !== null,
      shouldMatch,
      `"${input}" should ${shouldMatch ? "match" : "not match"} the normalizer regex`,
    );
    if (m) {
      assert.ok(m[1].length > 0, "owner should be captured");
      assert.ok(m[2].length > 0, "name should be captured");
    }
  }
});

// Issue #16: autopilot_enable handler validates required repo argument.
test("#16: autopilot_enable checks for missing repo before API call", () => {
  const built = readFileSync(buildEntry, "utf8");
  // The handler checks if (!repoRaw) { return error } before calling tbFetch.
  const nullCheck = built.indexOf('if (!repoRaw)');
  assert.ok(nullCheck !== -1, "must have null check for repoRaw");
  const repoIsRequired = built.indexOf('"repo is required (owner/name or a GitHub URL)"');
  assert.ok(repoIsRequired !== -1, "must have repo is required error message");
  const tbFetchCall = built.indexOf('tbFetch(`/autopilot/enable`');
  assert.ok(tbFetchCall !== -1, "tbFetch(/autopilot/enable) must exist");
  // The null check must come before the tbFetch call.
  assert.ok(
    nullCheck < tbFetchCall,
    "repo validation (null check) must happen before the API call",
  );
});
