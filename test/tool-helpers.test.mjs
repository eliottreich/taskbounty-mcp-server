import assert from "node:assert/strict";
import test from "node:test";

import { parseGitHubRepo } from "../build/tool-helpers.js";

test("parseGitHubRepo accepts owner/name", () => {
  assert.deepEqual(parseGitHubRepo("acme/widgets"), {
    ok: true,
    repo: "acme/widgets",
  });
});

test("parseGitHubRepo accepts full GitHub URL", () => {
  assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets"), {
    ok: true,
    repo: "acme/widgets",
  });
});

test("parseGitHubRepo accepts .git suffix and trailing slash", () => {
  assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets.git/"), {
    ok: true,
    repo: "acme/widgets",
  });
});

test("parseGitHubRepo rejects malformed input", () => {
  const result = parseGitHubRepo("not a repo");

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected parse to fail");
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0]?.text ?? "", /Could not parse repo/);
});

test("parseGitHubRepo returns the autopilot missing-repo tool error", () => {
  const result = parseGitHubRepo("");

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected parse to fail");
  assert.equal(result.result.isError, true);
  assert.equal(result.result.content[0]?.text, "repo is required (owner/name or a GitHub URL)");
});
