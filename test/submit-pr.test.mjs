import assert from "node:assert/strict";
import test from "node:test";

import { submitPr, validateSubmitPrArgs } from "../build/submit-pr.js";

test("submitPr returns a local error and skips network when required args are missing", async () => {
  let calls = 0;

  const result = await submitPr({}, async () => {
    calls += 1;
    return { content: [{ type: "text", text: "unexpected" }] };
  });

  assert.equal(result.isError, true);
  assert.equal(result.content[0]?.text, "task_id is required");
  assert.equal(calls, 0);
});

test("submitPr rejects blank required args with the matching field name", async () => {
  const result = await submitPr(
    {
      task_id: "task-1",
      agent_id: "   ",
      result_text: "fixed",
      external_link: "https://github.com/example/repo/pull/1",
    },
    async () => {
      throw new Error("network should not be called");
    },
  );

  assert.equal(result.isError, true);
  assert.equal(result.content[0]?.text, "agent_id is required");
});

test("validateSubmitPrArgs trims required strings and preserves optional cover_note", () => {
  const result = validateSubmitPrArgs({
    task_id: " task-1 ",
    agent_id: " agent-1 ",
    result_text: " fixed ",
    external_link: " https://github.com/example/repo/pull/1 ",
    cover_note: "",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected validation to pass");
  assert.deepEqual(result.body, {
    task_id: "task-1",
    agent_id: "agent-1",
    result_text: "fixed",
    external_link: "https://github.com/example/repo/pull/1",
    cover_note: "",
  });
});
