import assert from "node:assert/strict";
import test from "node:test";

const github = await import("../build/github.js");

test("extractGithubToken reads installation token from clone URL password", () => {
  const token = github.extractGithubToken(
    "https://x-access-token:ghs_example%2Ftoken@github.com/acme/private-repo.git",
  );

  assert.equal(token, "ghs_example/token");
});

test("parseGithubRepo accepts GitHub clone URLs", () => {
  assert.deepEqual(
    github.parseGithubRepo("https://x-access-token:token@github.com/acme/private-repo.git"),
    { owner: "acme", repo: "private-repo" },
  );
});

test("buildCreatePullRequestBody defaults base and maintainer flag", () => {
  assert.deepEqual(
    github.buildCreatePullRequestBody({
      head: "codex/fix-private-pr-flow",
      title: "Fix private PR flow",
      body: "Adds upstream PR creation from the TaskBounty installation token.",
    }),
    {
      title: "Fix private PR flow",
      head: "codex/fix-private-pr-flow",
      base: "main",
      body: "Adds upstream PR creation from the TaskBounty installation token.",
      maintainer_can_modify: true,
    },
  );
});
