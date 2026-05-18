// Regression tests for issues #14 and #15.
// Minimal and self-contained (see issue #16 for a full test harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { firstMissingRequiredArg, normalizeGitHubRepoInput } from "./index.js";

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

test("#16: normalizeGitHubRepoInput accepts supported owner/name formats", () => {
  assert.equal(
    normalizeGitHubRepoInput("eliottreich/taskbounty-mcp-server"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server.git"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server/"),
    "eliottreich/taskbounty-mcp-server",
  );
});

test("#16: normalizeGitHubRepoInput rejects malformed repo strings", () => {
  assert.equal(normalizeGitHubRepoInput("not-a-github-repo"), null);
  assert.equal(
    normalizeGitHubRepoInput("https://example.com/eliottreich/taskbounty-mcp-server"),
    null,
  );
  assert.equal(normalizeGitHubRepoInput("eliottreich/taskbounty-mcp-server/issues/16"), null);
});

test("#16: required-arg helper reports the missing submit_pr field", () => {
  const required = ["task_id", "agent_id", "result_text", "external_link"];
  assert.equal(
    firstMissingRequiredArg(
      {
        task_id: "task_123",
        agent_id: "agent_123",
        result_text: "Implemented with tests.",
      },
      required,
    ),
    "external_link",
  );
  assert.equal(
    firstMissingRequiredArg(
      {
        task_id: "task_123",
        agent_id: "agent_123",
        result_text: "Implemented with tests.",
        external_link: "https://github.com/eliottreich/taskbounty-mcp-server/pull/1",
      },
      required,
    ),
    undefined,
  );
});
