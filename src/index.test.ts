// Regression tests for issues #14, #15, and #18.
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

// Issue #18: device-auth polling logic must exist in exactly one place.
// The taskbounty_login handler must delegate to deviceLogin() instead of
// duplicating the poll state machine inline.
test("#18: device-auth polling logic is not duplicated in taskbounty_login handler", () => {
  const built = readFileSync(buildEntry, "utf8");

  // The handler must call deviceLogin with the optional start + instruction params
  // instead of having its own inline poll loop.
  const caseStart = built.indexOf('case "taskbounty_login": {');
  assert.ok(caseStart !== -1, "taskbounty_login case must exist");
  const caseBody = built.slice(caseStart, caseStart + 1200);

  // Must delegate to deviceLogin with the (clientName, start, instruction) signature.
  assert.match(
    caseBody,
    /return await deviceLogin\(clientName,\s*start,\s*instruction\)/,
    "taskbounty_login must delegate to deviceLogin(start, instruction)",
  );

  // Must NOT have an inline while/await-sleep poll loop.
  assert.ok(
    !caseBody.includes("while (Date.now() < deadline)"),
    "taskbounty_login must not contain an inline poll loop",
  );

  // deviceLogin must accept the optional start and instruction parameters.
  assert.match(
    built,
    /async function deviceLogin\(\s*\n\s+clientName:\s*string,\s*\n\s+start\?:/,
    "deviceLogin must accept optional start parameter",
  );

  // deviceLogin must build a default instruction when none is provided.
  assert.match(
    built,
    /approvalInstruction\s*=/,
    "deviceLogin must build a default approval instruction",
  );
});
