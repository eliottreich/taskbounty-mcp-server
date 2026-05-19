// Regression tests for issues #14 and #15.
// Minimal and self-contained (see issue #16 for a full test harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDeviceLogin } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const buildEntry = join(here, "..", "build", "index.js");
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string };

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
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

test("#18: device login polls pending state until success", async () => {
  const requests: { url: string; body: unknown }[] = [];
  const saved: { accessToken?: string; userId?: string } = {};
  let now = 1_700_000_000_000;

  const fetchFn = (async (
    input: FetchInput,
    init?: FetchInit,
  ): Promise<Response> => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
    });
    if (String(input).endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "dev-1",
        user_code: "ABCD-EFGH",
        verification_uri: "https://task.example/device",
        verification_uri_complete:
          "https://task.example/device?code=ABCD-EFGH",
        expires_in: 60,
        interval: 1,
      });
    }
    const tokenRequests = requests.filter((req) =>
      req.url.endsWith("/api/mcp/device/token"),
    );
    if (tokenRequests.length === 1) {
      return jsonResponse(
        { error: "authorization_pending" },
        { status: 400, statusText: "Bad Request" },
      );
    }
    return jsonResponse({
      access_token: "tb_live_test",
      taskbounty_user_id: "user-1",
    });
  }) as typeof fetch;

  const result = await runDeviceLogin({
    clientName: "test-client",
    fetchFn,
    sleepFn: async (ms) => {
      now += ms;
    },
    persistTokenFn: (accessToken, userId) => {
      saved.accessToken = accessToken;
      saved.userId = userId;
    },
    siteOrigin: "https://task.example",
    credPath: "/tmp/taskbounty-test-credentials.json",
    nowFn: () => now,
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /ABCD-EFGH/);
  assert.match(result.content[0]?.text ?? "", /Logged in/);
  assert.deepEqual(saved, {
    accessToken: "tb_live_test",
    userId: "user-1",
  });
  assert.equal(
    requests.filter((req) => req.url.endsWith("/api/mcp/device/start")).length,
    1,
  );
  assert.equal(
    requests.filter((req) => req.url.endsWith("/api/mcp/device/token")).length,
    2,
  );
});

test("#18: device login returns approval instruction when code expires", async () => {
  const requests: string[] = [];

  const fetchFn = (async (input: FetchInput): Promise<Response> => {
    requests.push(String(input));
    if (String(input).endsWith("/api/mcp/device/start")) {
      return jsonResponse({
        device_code: "dev-2",
        user_code: "WXYZ-1234",
        verification_uri: "https://task.example/device",
        verification_uri_complete:
          "https://task.example/device?code=WXYZ-1234",
        expires_in: 60,
        interval: 1,
      });
    }
    return jsonResponse(
      { error: "expired_token" },
      { status: 400, statusText: "Bad Request" },
    );
  }) as typeof fetch;

  const result = await runDeviceLogin({
    clientName: "test-client",
    fetchFn,
    sleepFn: async () => {},
    persistTokenFn: () => {
      throw new Error("expired token must not persist credentials");
    },
    siteOrigin: "https://task.example",
    nowFn: () => 1_700_000_000_000,
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /WXYZ-1234/);
  assert.match(result.content[0]?.text ?? "", /Login code expired/);
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/start")).length,
    1,
  );
  assert.equal(
    requests.filter((url) => url.endsWith("/api/mcp/device/token")).length,
    1,
  );
});

test("#18: taskbounty_login uses the shared device login implementation", () => {
  const built = readFileSync(buildEntry, "utf8");
  const startFetchCall = 'fetchFn(`${siteOrigin}/api/mcp/device/start`,';
  assert.equal(
    built.split(startFetchCall).length - 1,
    1,
    "device-auth start request must only be made in the shared implementation",
  );

  const caseStart = built.indexOf('case "taskbounty_login": {');
  assert.ok(caseStart !== -1, "taskbounty_login case must exist");
  const caseBody = built.slice(caseStart, caseStart + 900);
  assert.match(caseBody, /deviceLogin\(clientName\)/);
  assert.ok(
    !caseBody.includes("/api/mcp/device/start"),
    "taskbounty_login must not duplicate device-auth start logic inline",
  );
});
