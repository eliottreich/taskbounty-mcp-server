/**
 * Tests for the missing-required-arg validation path in tool handlers.
 *
 * Several tools (submit_pr, create_bounty_draft, request_repo_access, etc.)
 * validate that required arguments are present before proceeding. This file
 * tests that validation logic directly.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Helper: simulate the required-arg check used across tool handlers.
// Pattern from src/index.ts:
//   const required = ["task_id", "agent_id", "result_text", "external_link"];
//   for (const key of required) {
//     if (a[key] === undefined || a[key] === null || a[key] === "") {
//       return error(key + " is required");
//     }
//   }
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

function firstMissing(args: Args, required: string[]): string | null {
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// submit_pr required args
// ---------------------------------------------------------------------------

const SUBMIT_PR_REQUIRED: string[] = [
  "task_id",
  "agent_id",
  "result_text",
  "external_link",
];

describe("submit_pr required-arg validation", () => {
  const validArgs: Args = {
    task_id: "abc-123",
    agent_id: "agent-007",
    result_text: "Fixed the bug",
    external_link: "https://github.com/user/repo/pull/42",
  };

  test("all required args present passes validation", () => {
    assert.equal(firstMissing(validArgs, SUBMIT_PR_REQUIRED), null);
  });

  test("missing task_id returns task_id as missing", () => {
    const { task_id: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, SUBMIT_PR_REQUIRED), "task_id");
  });

  test("missing agent_id returns agent_id as missing", () => {
    const { agent_id: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, SUBMIT_PR_REQUIRED), "agent_id");
  });

  test("missing result_text returns result_text as missing", () => {
    const { result_text: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, SUBMIT_PR_REQUIRED), "result_text");
  });

  test("missing external_link returns external_link as missing", () => {
    const { external_link: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, SUBMIT_PR_REQUIRED), "external_link");
  });

  test("undefined task_id is detected as missing", () => {
    assert.equal(
      firstMissing({ ...validArgs, task_id: undefined }, SUBMIT_PR_REQUIRED),
      "task_id",
    );
  });

  test("null agent_id is detected as missing", () => {
    assert.equal(
      firstMissing({ ...validArgs, agent_id: null }, SUBMIT_PR_REQUIRED),
      "agent_id",
    );
  });

  test("empty string result_text is detected as missing", () => {
    assert.equal(
      firstMissing({ ...validArgs, result_text: "" }, SUBMIT_PR_REQUIRED),
      "result_text",
    );
  });

  test("zero is treated as present (valid value, not empty)", () => {
    // numeric values are valid; the check only rejects undefined/null/""
    assert.equal(firstMissing({ ...validArgs, task_id: 0 }, SUBMIT_PR_REQUIRED), null);
  });

  test("false is treated as present", () => {
    assert.equal(firstMissing({ ...validArgs, task_id: false }, SUBMIT_PR_REQUIRED), null);
  });
});

// ---------------------------------------------------------------------------
// create_bounty_draft required args
// ---------------------------------------------------------------------------

const CREATE_DRAFT_REQUIRED: string[] = [
  "title",
  "short_summary",
  "description",
  "category",
  "bounty_amount",
  "submission_deadline",
];

describe("create_bounty_draft required-arg validation", () => {
  const validArgs: Args = {
    title: "Fix login bug",
    short_summary: "Fix the broken login flow",
    description: "Users are unable to login when...",
    category: "code",
    bounty_amount: 100,
    submission_deadline: "2025-12-31T23:59:59Z",
  };

  test("all required args present passes validation", () => {
    assert.equal(firstMissing(validArgs, CREATE_DRAFT_REQUIRED), null);
  });

  test("missing title returns title", () => {
    const { title: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, CREATE_DRAFT_REQUIRED), "title");
  });

  test("missing short_summary returns short_summary", () => {
    const { short_summary: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, CREATE_DRAFT_REQUIRED), "short_summary");
  });

  test("missing description returns description", () => {
    const { description: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, CREATE_DRAFT_REQUIRED), "description");
  });

  test("missing category returns category", () => {
    const { category: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, CREATE_DRAFT_REQUIRED), "category");
  });

  test("missing bounty_amount returns bounty_amount", () => {
    const { bounty_amount: _, ...rest } = validArgs;
    assert.equal(firstMissing(rest, CREATE_DRAFT_REQUIRED), "bounty_amount");
  });

  test("missing submission_deadline returns submission_deadline", () => {
    const { submission_deadline: _, ...rest } = validArgs;
    assert.equal(
      firstMissing(rest, CREATE_DRAFT_REQUIRED),
      "submission_deadline",
    );
  });

  test("zero bounty_amount is treated as present (valid value)", () => {
    assert.equal(
      firstMissing({ ...validArgs, bounty_amount: 0 }, CREATE_DRAFT_REQUIRED),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// Single-arg tool validators (request_repo_access, fund_bounty, etc.)
// ---------------------------------------------------------------------------

describe("single-required-arg tool validation", () => {
  test("request_repo_access: missing task_id returns task_id", () => {
    assert.equal(firstMissing({}, ["task_id"]), "task_id");
  });

  test("request_repo_access: present task_id passes", () => {
    assert.equal(firstMissing({ task_id: "abc" }, ["task_id"]), null);
  });

  test("fund_bounty: missing task_id returns task_id", () => {
    assert.equal(firstMissing({}, ["task_id"]), "task_id");
  });

  test("get_bounty_detail: missing task_id_or_slug fails", () => {
    assert.equal(firstMissing({}, ["task_id_or_slug"]), "task_id_or_slug");
  });

  test("check_submission_status: missing submission_id fails", () => {
    assert.equal(firstMissing({}, ["submission_id"]), "submission_id");
  });

  test("award_bounty: missing task_id fails", () => {
    assert.equal(firstMissing({ submission_id: "s1" }, ["task_id", "submission_id"]), "task_id");
  });

  test("award_bounty: missing submission_id fails", () => {
    assert.equal(firstMissing({ task_id: "t1" }, ["task_id", "submission_id"]), "submission_id");
  });

  test("cancel_bounty: missing task_id fails", () => {
    assert.equal(firstMissing({}, ["task_id"]), "task_id");
  });

  test("get_bounty_submissions: missing task_id fails", () => {
    assert.equal(firstMissing({}, ["task_id"]), "task_id");
  });
});
