import assert from "node:assert/strict";
import test from "node:test";

const github = await import("../build/github.js");

test("extractInstallationToken reads x-access-token clone URL passwords", () => {
  assert.equal(
    github.extractInstallationToken(
      "https://x-access-token:ghs_example%2Ftoken@github.com/acme/private-repo.git",
    ),
    "ghs_example/token",
  );
});

test("extractInstallationToken also accepts token-only usernames", () => {
  assert.equal(
    github.extractInstallationToken("https://ghs_example%2Ftoken@github.com/acme/private-repo.git"),
    "ghs_example/token",
  );
});

test("parseGithubRepoUrl accepts authenticated GitHub clone URLs", () => {
  assert.deepEqual(
    github.parseGithubRepoUrl("https://x-access-token:token@github.com/acme/private-repo.git"),
    { owner: "acme", repo: "private-repo" },
  );
});

test("buildCreatePullRequestPayload defaults base and maintainer flag", () => {
  assert.deepEqual(
    github.buildCreatePullRequestPayload({
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
