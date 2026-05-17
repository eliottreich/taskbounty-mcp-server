import assert from "node:assert/strict";
import test from "node:test";

import { deviceLogin } from "../build/device-login.js";

const startResponse = {
  device_code: "device-1",
  user_code: "ABCD-EFGH",
  verification_uri: "https://task.example/device",
  verification_uri_complete: "https://task.example/device?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 1,
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("deviceLogin polls one started session through pending then success", async () => {
  const calls = [];
  const persisted = [];

  const result = await deviceLogin("test-client", {
    siteOrigin: "https://task.example",
    credPath: "/tmp/taskbounty/credentials.json",
    now: () => 0,
    sleep: async () => {},
    persistToken: (token, userId) => persisted.push({ token, userId }),
    fetchFn: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/device/start")) return jsonResponse(startResponse);
      if (calls.filter((call) => call.endsWith("/device/token")).length === 1) {
        return jsonResponse({ error: "authorization_pending" }, 400);
      }
      return jsonResponse({
        access_token: "tb_live_test",
        taskbounty_user_id: "user-1",
      });
    },
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Open this URL/);
  assert.match(result.content[0]?.text ?? "", /Logged in/);
  assert.equal(calls.filter((call) => call.endsWith("/device/start")).length, 1);
  assert.equal(calls.filter((call) => call.endsWith("/device/token")).length, 2);
  assert.deepEqual(persisted, [{ token: "tb_live_test", userId: "user-1" }]);
});

test("deviceLogin returns the shared instruction on expired_token", async () => {
  const result = await deviceLogin("test-client", {
    siteOrigin: "https://task.example",
    credPath: "/tmp/taskbounty/credentials.json",
    now: () => 0,
    sleep: async () => {},
    persistToken: () => {
      throw new Error("persistToken should not be called");
    },
    fetchFn: async (url) => {
      if (String(url).endsWith("/device/start")) return jsonResponse(startResponse);
      return jsonResponse({ error: "expired_token" }, 400);
    },
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Open this URL/);
  assert.match(result.content[0]?.text ?? "", /Login code expired before approval/);
});
