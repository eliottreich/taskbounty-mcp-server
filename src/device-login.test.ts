import { test } from "node:test";
import assert from "node:assert/strict";
import { pollDeviceLogin, type DeviceStart } from "./device-login.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const start: DeviceStart = {
  device_code: "device-123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://www.task-bounty.com/device",
  verification_uri_complete: "https://www.task-bounty.com/device?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 1,
};

test("#18: device login polling handles pending then success in one implementation", async () => {
  const sleeps: number[] = [];
  const persisted: { accessToken?: string; userId?: string } = {};
  let calls = 0;

  const result = await pollDeviceLogin({
    siteOrigin: "https://www.task-bounty.com",
    start,
    credPath: "/tmp/taskbounty-credentials.json",
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    now: () => 0,
    persistToken: (accessToken, userId) => {
      persisted.accessToken = accessToken;
      persisted.userId = userId;
    },
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://www.task-bounty.com/api/mcp/device/token");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({ device_code: start.device_code }),
      );
      if (calls === 1) {
        return jsonResponse({ error: "authorization_pending" }, { status: 400 });
      }
      return jsonResponse({
        access_token: "tb_live_success",
        taskbounty_user_id: "user_123",
      });
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1000, 1000]);
  assert.deepEqual(persisted, {
    accessToken: "tb_live_success",
    userId: "user_123",
  });
  assert.match(result.content[0].text, /Open this URL in your browser and approve/);
  assert.match(result.content[0].text, /Logged in/);
});

test("#18: device login polling returns a clear expired-token error", async () => {
  let persisted = false;

  const result = await pollDeviceLogin({
    siteOrigin: "https://www.task-bounty.com",
    start,
    credPath: "/tmp/taskbounty-credentials.json",
    sleepImpl: async () => {},
    now: () => 0,
    persistToken: () => {
      persisted = true;
    },
    fetchImpl: async () =>
      jsonResponse({ error: "expired_token" }, { status: 400 }),
  });

  assert.equal(result.isError, true);
  assert.equal(persisted, false);
  assert.match(result.content[0].text, /Open this URL in your browser and approve/);
  assert.match(result.content[0].text, /Login code expired before approval/);
});
