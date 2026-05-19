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

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type DeviceLoginHooks = {
  deviceLogin: (
    clientName: string,
    deps: {
      fetchFn: typeof fetch;
      sleepFn: (ms: number) => Promise<void>;
      nowFn: () => number;
      persistTokenFn: (accessToken: string, userId?: string) => void;
    },
  ) => Promise<ToolResult>;
};

async function loadHooks(): Promise<DeviceLoginHooks> {
  const mod = (await import(pathToFileURL(buildEntry).href)) as {
    __test: DeviceLoginHooks;
  };
  return mod.__test;
}

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

test("#18: device login polls authorization_pending then persists success", async () => {
  const hooks = await loadHooks();
  const requests: string[] = [];
  const persisted: { accessToken: string; userId?: string }[] = [];
  let tokenPolls = 0;
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "device-123",
        user_code: "USER-CODE",
        verification_uri: "https://www.task-bounty.com/device",
        verification_uri_complete:
          "https://www.task-bounty.com/device?code=USER-CODE",
        expires_in: 30,
        interval: 1,
      });
    }
    if (url.endsWith("/api/mcp/device/token")) {
      tokenPolls += 1;
      if (tokenPolls === 1) {
        return jsonResponse({ error: "authorization_pending" }, 400);
      }
      return jsonResponse({
        access_token: "tb_live_unit",
        taskbounty_user_id: "user-123",
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  }) as typeof fetch;

  const result = await hooks.deviceLogin("unit-test-client", {
    fetchFn,
    sleepFn: async () => {},
    nowFn: () => 0,
    persistTokenFn: (accessToken, userId) => {
      persisted.push({ accessToken, userId });
    },
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(persisted, [
    { accessToken: "tb_live_unit", userId: "user-123" },
  ]);
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/start")).length,
    1,
  );
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/token")).length,
    2,
  );
  const text = result.content[0]?.text ?? "";
  assert.match(text, /Open this URL in your browser and approve:/);
  assert.match(text, /Your code: USER-CODE/);
  assert.match(text, /Logged in/);
});

test("#18: device login returns instruction consistently for expired_token", async () => {
  const hooks = await loadHooks();
  const requests: string[] = [];
  const persisted: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "device-expired",
        user_code: "EXPIRED",
        verification_uri: "https://www.task-bounty.com/device",
        verification_uri_complete: "https://www.task-bounty.com/device?code=EXPIRED",
        expires_in: 30,
        interval: 1,
      });
    }
    if (url.endsWith("/api/mcp/device/token")) {
      return jsonResponse({ error: "expired_token" }, 400);
    }
    throw new Error(`unexpected URL: ${url}`);
  }) as typeof fetch;

  const result = await hooks.deviceLogin("unit-test-client", {
    fetchFn,
    sleepFn: async () => {},
    nowFn: () => 0,
    persistTokenFn: (accessToken) => {
      persisted.push(accessToken);
    },
  });

  assert.equal(result.isError, true);
  assert.deepEqual(persisted, []);
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/start")).length,
    1,
  );
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/token")).length,
    1,
  );
  const text = result.content[0]?.text ?? "";
  assert.match(text, /Open this URL in your browser and approve:/);
  assert.match(text, /Your code: EXPIRED/);
  assert.match(text, /Login code expired before approval/);
});
