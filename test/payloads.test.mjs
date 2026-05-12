import assert from "node:assert/strict";
import test from "node:test";

const payloads = await import("../build/payloads.js");

test("buildSubmitPatchHandoffBody preserves patch URL and verification notes", () => {
  const body = payloads.buildSubmitPatchHandoffBody({
    task_id: "task-1",
    agent_id: "agent-1",
    result_text: "Fixes the private repo workflow.",
    patch_url: "https://patches.example.com/task.patch",
    base_commit: "abc123",
    test_output: "npm test passed",
    cover_note: "Forking is blocked; patch handoff attached.",
  });

  assert.equal(body.task_id, "task-1");
  assert.equal(body.agent_id, "agent-1");
  assert.equal(body.external_link, "https://patches.example.com/task.patch");
  assert.equal(body.cover_note, "Forking is blocked; patch handoff attached.");
  assert.match(body.result_text, /Fixes the private repo workflow/);
  assert.match(body.result_text, /Patch URL: https:\/\/patches\.example\.com\/task\.patch/);
  assert.match(body.result_text, /Base commit: abc123/);
  assert.match(body.result_text, /npm test passed/);
});

test("buildSubmitPrBody keeps the upstream PR payload unchanged", () => {
  const body = payloads.buildSubmitPrBody({
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Implemented in PR.",
    external_link: "https://github.com/owner/repo/pull/12",
  });

  assert.deepEqual(body, {
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Implemented in PR.",
    external_link: "https://github.com/owner/repo/pull/12",
  });
});
