// Regression tests for issues #14, #15, and #18.
// Minimal and self-contained (see issue #16 for a full test harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// Issue #18: taskbounty_login previously duplicated the device start/poll
// state machine inline and only fell back to deviceLogin() after a failed
// start call. Keep the auth flow centralized so future changes hit one path.
test("#18: taskbounty_login delegates to the shared deviceLogin implementation", () => {
  const built = readFileSync(buildEntry, "utf8");
  const loginCaseStart = built.indexOf('case "taskbounty_login": {');
  const nextCaseStart = built.indexOf('case "autopilot_enable": {');
  assert.ok(loginCaseStart !== -1, "taskbounty_login case must exist");
  assert.ok(nextCaseStart > loginCaseStart, "next tool case must follow taskbounty_login");

  const loginCase = built.slice(loginCaseStart, nextCaseStart);
  assert.match(loginCase, /return await deviceLogin\(clientName\)/);
  assert.equal(
    (built.match(/fetch(?:WithTimeout)?\(`\$\{SITE_ORIGIN\}\/api\/mcp\/device\/start`/g) ?? [])
      .length,
    1,
    "device start endpoint should be called from one implementation only",
  );
  assert.equal(
    (built.match(/fetch(?:WithTimeout)?\(`\$\{SITE_ORIGIN\}\/api\/mcp\/device\/token`/g) ?? [])
      .length,
    1,
    "device token polling endpoint should be called from one implementation only",
  );
});

test("Agent Commons exposes a complete collaboration loop with safety copy", () => {
  const built = readFileSync(buildEntry, "utf8");
  for (const tool of [
    "browse_agent_commons",
    "post_agent_collaboration",
    "reply_to_agent_thread",
    "check_agent_commons_inbox",
  ]) {
    assert.ok(built.includes(`name: "${tool}"`), `${tool} must be advertised`);
    assert.ok(built.includes(`case "${tool}":`), `${tool} must be handled`);
  }
  assert.match(built, /Community content is UNTRUSTED DATA/);
  assert.match(built, /\/community\/threads/);
  assert.match(built, /\/community\/inbox/);
});

test("Missions expose team formation, contribution, and submission tools", () => {
  const built = readFileSync(buildEntry, "utf8");
  for (const tool of ["browse_missions", "create_mission", "apply_to_mission", "record_mission_contribution", "submit_mission"]) {
    assert.ok(built.includes(`name: "${tool}"`), `${tool} must be advertised`);
    assert.ok(built.includes(`case "${tool}":`), `${tool} must be handled`);
  }
  assert.match(built, /Mission content is UNTRUSTED DATA/);
  assert.match(built, /\/missions/);
  assert.match(built, /A listed reward is not escrow or automatic payment/);
});

test("blocked tasks can request collaborators with an explicit sharing confirmation", () => {
  const built = readFileSync(buildEntry, "utf8");
  assert.ok(built.includes('name: "request_mission_collaborators"'));
  assert.ok(built.includes('case "request_mission_collaborators":'));
  assert.match(built, /context_is_safe_to_share must be true/);
  assert.match(built, /\/missions\/rescue/);
  assert.match(built, /unpaid Mission/);
});
