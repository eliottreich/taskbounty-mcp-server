import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function lockVersion(packagePath) {
  const node = lockfile.packages?.[packagePath];
  assert.ok(node, `${packagePath} is present in package-lock.json`);
  return node.version;
}

function assertAtLeast(actual, minimum) {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let index = 0; index < minimumParts.length; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;

    if (actualPart > minimumPart) return;
    if (actualPart < minimumPart) {
      assert.fail(`expected ${actual} to be at least ${minimum}`);
    }
  }
}

test('lockfile keeps audited transitive dependencies on patched versions', () => {
  assertAtLeast(lockVersion('node_modules/hono'), '4.12.19');
  assertAtLeast(lockVersion('node_modules/express-rate-limit'), '8.5.2');
  assertAtLeast(lockVersion('node_modules/ip-address'), '10.2.0');
});
