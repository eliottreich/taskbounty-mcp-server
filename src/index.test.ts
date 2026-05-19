// Regression tests for issues #14 and #15.
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

type DeviceLogin = (
  clientName: string,
  overrides: {
    fetch: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    persistToken: (accessToken: string, userId?: string) => void;
    siteOrigin: string;
    credPath: string;
  },
) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;

async function loadDeviceLogin(): Promise<DeviceLogin> {
  const mod = (await import(pathToFileURL(buildEntry).href)) as {
    deviceLogin: DeviceLogin;
  };
  return mod.deviceLogin;
}

const deviceStart = {
  device_code: "device-123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://www.task-bounty.com/device",
  verification_uri_complete: "https://www.task-bounty.com/device?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Issue #18: the shared device-login implementation must handle the normal
// OAuth device flow state machine without duplicating it in taskbounty_login.
test("#18: deviceLogin polls authorization_pending then persists a successful token", async () => {
  const deviceLogin = await loadDeviceLogin();
  const calls: string[] = [];
  const persisted: { token?: string; userId?: string } = {};
  let tokenPolls = 0;

  const result = await deviceLogin("test-client", {
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/mcp/device/start")) return jsonResponse(deviceStart);
      tokenPolls += 1;
      if (tokenPolls === 1) {
        return jsonResponse({ error: "authorization_pending" }, 400);
      }
      return jsonResponse({
        access_token: "tb_test_success",
        taskbounty_user_id: "user-123",
      });
    },
    sleep: async () => {},
    now: () => 0,
    persistToken: (accessToken, userId) => {
      persisted.token = accessToken;
      persisted.userId = userId;
    },
    siteOrigin: "https://www.task-bounty.com",
    credPath: "/tmp/taskbounty-test-credentials.json",
  });

  assert.equal(result.isError, undefined);
  assert.equal(persisted.token, "tb_test_success");
  assert.equal(persisted.userId, "user-123");
  assert.equal(calls.filter((url) => url.endsWith("/api/mcp/device/token")).length, 2);
  const text = result.content[0]?.text ?? "";
  assert.match(text, /https:\/\/www\.task-bounty\.com\/device\?user_code=ABCD-EFGH/);
  assert.match(text, /Your code: ABCD-EFGH/);
  assert.match(text, /Logged in/);
});

test("#18: deviceLogin returns a consistent instruction on expired_token", async () => {
  const deviceLogin = await loadDeviceLogin();
  let persisted = false;

  const result = await deviceLogin("test-client", {
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/mcp/device/start")) return jsonResponse(deviceStart);
      return jsonResponse({ error: "expired_token" }, 400);
    },
    sleep: async () => {},
    now: () => 0,
    persistToken: () => {
      persisted = true;
    },
    siteOrigin: "https://www.task-bounty.com",
    credPath: "/tmp/taskbounty-test-credentials.json",
  });

  assert.equal(result.isError, true);
  assert.equal(persisted, false);
  const text = result.content[0]?.text ?? "";
  assert.match(text, /https:\/\/www\.task-bounty\.com\/device\?user_code=ABCD-EFGH/);
  assert.match(text, /Your code: ABCD-EFGH/);
  assert.match(text, /Login code expired before approval/);
});

test("#18: taskbounty_login delegates to the single deviceLogin implementation", () => {
  const built = readFileSync(buildEntry, "utf8");
  const tokenEndpointUses = built.match(/\/api\/mcp\/device\/token/g) ?? [];
  assert.equal(tokenEndpointUses.length, 1);

  const caseStart = built.indexOf('case "taskbounty_login": {');
  assert.ok(caseStart !== -1, "taskbounty_login case must exist");
  const caseBody = built.slice(caseStart, caseStart + 900);
  assert.match(caseBody, /return await deviceLogin\(clientName\)/);
  assert.doesNotMatch(caseBody, /\/api\/mcp\/device\/token/);
});
