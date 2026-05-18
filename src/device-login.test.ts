import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDeviceLogin } from "./device-login.js";

const here = dirname(fileURLToPath(import.meta.url));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const startPayload = {
  device_code: "device-123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://www.task-bounty.com/device",
  verification_uri_complete: "https://www.task-bounty.com/device?user_code=ABCD-EFGH",
  expires_in: 60,
  interval: 2,
};

test("#18: device login polls authorization_pending until success", async () => {
  const responses = [
    jsonResponse(200, startPayload),
    jsonResponse(400, { error: "authorization_pending" }),
    jsonResponse(200, { access_token: "tb_live_test", taskbounty_user_id: "user-1" }),
  ];
  const sleeps: number[] = [];
  const persisted: Array<{ token: string; userId?: string }> = [];

  const result = await runDeviceLogin({
    siteOrigin: "https://www.task-bounty.com",
    clientName: "test-client",
    credentialPath: "/tmp/taskbounty/credentials.json",
    nowMs: (() => {
      let now = 0;
      return () => now++;
    })(),
    sleepMs: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => {
      const response = responses.shift();
      assert.ok(response);
      return response;
    },
    persistToken: (token, userId) => persisted.push({ token, userId }),
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(sleeps, [2000, 2000]);
  assert.deepEqual(persisted, [{ token: "tb_live_test", userId: "user-1" }]);
  assert.match(result.content[0].text, /Your code: ABCD-EFGH/);
  assert.match(result.content[0].text, /Logged in/);
});

test("#18: device login keeps approval instructions on expired_token", async () => {
  const result = await runDeviceLogin({
    siteOrigin: "https://www.task-bounty.com",
    clientName: "test-client",
    credentialPath: "/tmp/taskbounty/credentials.json",
    sleepMs: async () => {},
    fetchImpl: async (url) =>
      String(url).endsWith("/device/start")
        ? jsonResponse(200, startPayload)
        : jsonResponse(400, { error: "expired_token" }),
    persistToken: () => {
      throw new Error("must not persist expired tokens");
    },
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Your code: ABCD-EFGH/);
  assert.match(result.content[0].text, /Login code expired before approval/);
});

test("#18: index delegates device auth instead of duplicating the poll state machine", () => {
  const source = readFileSync(join(here, "..", "src", "index.ts"), "utf8");
  assert.equal((source.match(/api\/mcp\/device\/start/g) ?? []).length, 0);
  assert.equal((source.match(/authorization_pending/g) ?? []).length, 0);
  assert.match(source, /runDeviceLogin/);
});
