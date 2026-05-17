import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PKG_VERSION, SERVER_INFO } from "../build/version.js";

test("MCP server advertises the package version", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(PKG_VERSION, packageJson.version);
  assert.equal(SERVER_INFO.version, packageJson.version);
});
