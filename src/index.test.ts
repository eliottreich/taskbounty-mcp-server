// Regression tests for issues #14 and #15.
// Minimal and self-contained (see issue #16 for a full test harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pollDeviceLogin } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const buildEntry = join(here, "..", "build", "index.js");
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string };

const deviceStart = {
  device_code: "device-code-1",
  user_code: "ABCD-EFGH",
  verification_uri: "https://example.test/activate",
  verification_uri_complete: "https://example.test/activate?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

test("#18: device login poller handles authorization_pending then success", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const tokenRequests: unknown[] = [];
  const saved: { token?: string; userId?: string } = {};

  const result = await pollDeviceLogin(deviceStart, {
    fetch: async (_url, init) => {
      tokenRequests.push(JSON.parse(String(init?.body ?? "{}")));
      if (tokenRequests.length === 1) {
        return jsonResponse({ error: "authorization_pending" }, 400);
      }
      return jsonResponse({ access_token: "tb_live_test", taskbounty_user_id: "user-1" });
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    now: () => now,
    persistToken: (token, userId) => {
      saved.token = token;
      saved.userId = userId;
    },
    credentialPath: "/tmp/taskbounty-test/credentials.json",
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(sleeps, [1000, 1000]);
  assert.deepEqual(tokenRequests, [
    { device_code: "device-code-1" },
    { device_code: "device-code-1" },
  ]);
  assert.equal(saved.token, "tb_live_test");
  assert.equal(saved.userId, "user-1");
  assert.match(result.content[0].text, /Open this URL in your browser and approve/);
  assert.match(result.content[0].text, /Credentials saved/);
});

test("#18: device login poller returns the shared instruction on expired_token", async () => {
  let now = 0;
  const result = await pollDeviceLogin(deviceStart, {
    fetch: async () => jsonResponse({ error: "expired_token" }, 400),
    sleep: async (ms) => {
      now += ms;
    },
    now: () => now,
    persistToken: () => {
      throw new Error("persistToken should not be called for expired login");
    },
    credentialPath: "/tmp/taskbounty-test/credentials.json",
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Open this URL in your browser and approve/);
  assert.match(result.content[0].text, /Login code expired before approval/);
});
