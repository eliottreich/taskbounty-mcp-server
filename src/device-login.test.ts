import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDeviceLoginFlow } from "./device-login.js";

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

test("#18: shared device login polls authorization_pending until success", async () => {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const persisted: { token: string; userId?: string }[] = [];
  const responses = [
    jsonResponse(200, startPayload),
    jsonResponse(400, { error: "authorization_pending" }),
    jsonResponse(200, {
      access_token: "tb_live_test",
      taskbounty_user_id: "user-1",
    }),
  ];

  const result = await runDeviceLoginFlow({
    siteOrigin: "https://www.task-bounty.com",
    clientName: "test-client",
    credentialPath: "/tmp/taskbounty/credentials.json",
    nowMs: (() => {
      let now = 0;
      return () => now++;
    })(),
    sleepMs: async (ms: number) => {
      sleeps.push(ms);
    },
    fetchImpl: async (url: string | URL | Request) => {
      calls.push(String(url));
      const response = responses.shift();
      assert.ok(response, "unexpected fetch call");
      return response;
    },
    persistToken: (token: string, userId?: string) => {
      persisted.push({ token, userId });
    },
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(sleeps, [2000, 2000]);
  assert.deepEqual(calls, [
    "https://www.task-bounty.com/api/mcp/device/start",
    "https://www.task-bounty.com/api/mcp/device/token",
    "https://www.task-bounty.com/api/mcp/device/token",
  ]);
  assert.deepEqual(persisted, [{ token: "tb_live_test", userId: "user-1" }]);
  const text = result.content[0].text;
  assert.match(text, /https:\/\/www\.task-bounty\.com\/device\?user_code=ABCD-EFGH/);
  assert.match(text, /Your code: ABCD-EFGH/);
  assert.match(text, /Logged in/);
});

test("#18: shared device login includes approval instruction on expired_token", async () => {
  const result = await runDeviceLoginFlow({
    siteOrigin: "https://www.task-bounty.com",
    clientName: "test-client",
    credentialPath: "/tmp/taskbounty/credentials.json",
    sleepMs: async () => {},
    fetchImpl: async (url: string | URL | Request) => {
      if (String(url).endsWith("/device/start")) return jsonResponse(200, startPayload);
      return jsonResponse(400, { error: "expired_token" });
    },
    persistToken: () => {
      throw new Error("must not persist on expired_token");
    },
  });

  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /https:\/\/www\.task-bounty\.com\/device\?user_code=ABCD-EFGH/);
  assert.match(text, /Your code: ABCD-EFGH/);
  assert.match(text, /Login code expired before approval/);
});

test("#18: src/index.ts delegates device auth instead of duplicating start and poll logic", () => {
  const source = readFileSync(join(here, "..", "src", "index.ts"), "utf8");
  assert.equal(
    (source.match(/api\/mcp\/device\/start/g) ?? []).length,
    0,
    "index.ts should not start device auth inline",
  );
  assert.equal(
    (source.match(/authorization_pending/g) ?? []).length,
    0,
    "index.ts should not duplicate the device poll state machine",
  );
  assert.match(source, /runDeviceLoginFlow/);
});
