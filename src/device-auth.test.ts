import assert from "node:assert/strict";
import { test } from "node:test";

// The test imports compiled output after npm run build; this package does not emit .d.ts files.
// @ts-ignore TS7016
import { runDeviceLogin } from "../build/device-auth.js";

const startPayload = {
  device_code: "device-123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://task.example/device",
  verification_uri_complete: "https://task.example/device?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeps(responses: Response[]) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const persisted: { token: string; userId?: string }[] = [];

  return {
    calls,
    sleeps,
    persisted,
    deps: {
      siteOrigin: "https://task.example",
      credentialPath: "/tmp/taskbounty/credentials.json",
      nowMs: () => 0,
      sleepMs: async (ms: number) => {
        sleeps.push(ms);
      },
      persistToken: (token: string, userId?: string) => {
        persisted.push({ token, userId });
      },
      fetchFn: async (url: string | URL | Request) => {
        const endpoint = String(url).endsWith("/device/start") ? "start" : "token";
        calls.push(endpoint);
        const next = responses.shift();
        assert.ok(next, `unexpected ${endpoint} fetch`);
        return next;
      },
    },
  };
}

test("runDeviceLogin uses one started session through pending then success", async () => {
  const { calls, persisted, deps } = createDeps([
    jsonResponse(startPayload),
    jsonResponse({ error: "authorization_pending" }, 400),
    jsonResponse({ access_token: "tb_live_test", taskbounty_user_id: "user-1" }),
  ]);

  const result = await runDeviceLogin("test-client", deps);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["start", "token", "token"]);
  assert.deepEqual(persisted, [{ token: "tb_live_test", userId: "user-1" }]);
  assert.match(result.content[0]?.text ?? "", /Open this URL/);
  assert.match(result.content[0]?.text ?? "", /Logged in/);
});

test("runDeviceLogin backs off when the device endpoint returns slow_down", async () => {
  const { sleeps, deps } = createDeps([
    jsonResponse(startPayload),
    jsonResponse({ error: "slow_down" }, 400),
    jsonResponse({ access_token: "tb_live_test" }),
  ]);

  const result = await runDeviceLogin("test-client", deps);

  assert.equal(result.isError, undefined);
  assert.deepEqual(sleeps, [1000, 6000]);
});

test("runDeviceLogin returns the shared instruction on expired_token", async () => {
  const { deps } = createDeps([
    jsonResponse(startPayload),
    jsonResponse({ error: "expired_token" }, 400),
  ]);
  deps.persistToken = () => {
    assert.fail("persistToken should not be called");
  };

  const result = await runDeviceLogin("test-client", deps);

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Open this URL/);
  assert.match(result.content[0]?.text ?? "", /Login code expired before approval/);
});
