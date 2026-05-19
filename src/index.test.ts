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

type DeviceLoginResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type DeviceLogin = (
  clientName: string,
  options: {
    fetchImpl: typeof fetch;
    persistTokenFn: (accessToken: string, userId?: string) => void;
    sleepFn: (ms: number) => Promise<void>;
  },
) => Promise<DeviceLoginResult>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadDeviceLogin(): Promise<DeviceLogin> {
  const mod = (await import(pathToFileURL(buildEntry).href)) as {
    deviceLogin: DeviceLogin;
  };
  return mod.deviceLogin;
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

test("#18: device auth endpoint calls are centralized in deviceLogin", () => {
  const source = readFileSync(join(here, "..", "src", "index.ts"), "utf8");
  assert.equal(
    source.match(/fetchImpl\(`\$\{SITE_ORIGIN\}\/api\/mcp\/device\/start`/g)?.length,
    1,
    "device start should only be called by the shared deviceLogin implementation",
  );
  assert.equal(
    source.match(/fetchImpl\(`\$\{SITE_ORIGIN\}\/api\/mcp\/device\/token`/g)?.length,
    1,
    "device token polling should only be called by the shared deviceLogin implementation",
  );
  assert.match(source, /case "taskbounty_login"[\s\S]*return await deviceLogin\(clientName\);/);
});

test("#18: deviceLogin polls authorization_pending then persists success", async () => {
  const deviceLogin = await loadDeviceLogin();
  const calls: { url: string; body: unknown }[] = [];
  const sleepIntervals: number[] = [];
  let tokenPolls = 0;
  let persisted: { accessToken: string; userId?: string } | null = null;

  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });

    if (url.endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "device-123",
        user_code: "USER-123",
        verification_uri: "https://www.task-bounty.com/device",
        verification_uri_complete: "https://www.task-bounty.com/device?code=USER-123",
        expires_in: 60,
        interval: 1,
      });
    }

    tokenPolls += 1;
    assert.equal(url.endsWith("/api/mcp/device/token"), true);
    assert.deepEqual(body, { device_code: "device-123" });
    if (tokenPolls === 1) {
      return jsonResponse({ error: "authorization_pending" }, 400);
    }
    return jsonResponse({
      access_token: "tb_live_test_token",
      taskbounty_user_id: "user-123",
    });
  };

  const result = await deviceLogin("test-client", {
    fetchImpl,
    sleepFn: async (ms: number) => {
      sleepIntervals.push(ms);
    },
    persistTokenFn: (accessToken: string, userId?: string) => {
      persisted = { accessToken, userId };
    },
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Open this URL in your browser and approve/);
  assert.match(result.content[0]?.text ?? "", /Logged in/);
  assert.deepEqual(persisted, {
    accessToken: "tb_live_test_token",
    userId: "user-123",
  });
  assert.equal(calls.filter((call) => call.url.endsWith("/api/mcp/device/start")).length, 1);
  assert.equal(tokenPolls, 2);
  assert.deepEqual(sleepIntervals, [1000, 1000]);
});

test("#18: deviceLogin returns expired_token with the same approval instruction", async () => {
  const deviceLogin = await loadDeviceLogin();
  let persisted = false;

  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "device-expired",
        user_code: "USER-999",
        verification_uri: "https://www.task-bounty.com/device",
        verification_uri_complete: "https://www.task-bounty.com/device?code=USER-999",
        expires_in: 60,
        interval: 1,
      });
    }
    return jsonResponse({ error: "expired_token" }, 400);
  };

  const result = await deviceLogin("test-client", {
    fetchImpl,
    sleepFn: async () => {},
    persistTokenFn: () => {
      persisted = true;
    },
  });

  assert.equal(result.isError, true);
  assert.equal(persisted, false);
  assert.match(result.content[0]?.text ?? "", /Open this URL in your browser and approve/);
  assert.match(result.content[0]?.text ?? "", /Login code expired before approval/);
});
