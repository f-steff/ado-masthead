import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS } from "../src/extension/shared/permissions";

test("the permission explorer lists every requested scope", () => {
  assert.deepEqual(PERMISSIONS.map((item) => item.scope), [
    "vso.code_write",
    "vso.build_execute",
    "vso.build",
    "vso.code",
    "vso.extension.data_write",
    "vso.project"
  ]);
  assert.equal(new Set(PERMISSIONS.map((item) => item.id)).size, PERMISSIONS.length);
});

test("only code write and build execute are marked high privilege", () => {
  assert.deepEqual(
    PERMISSIONS.filter((item) => item.highPrivilege).map((item) => item.scope),
    ["vso.code_write", "vso.build_execute"]
  );
});

test("the code-write explanation preserves the advisory boundary", () => {
  const codeWrite = PERMISSIONS.find((item) => item.scope === "vso.code_write");
  assert.ok(codeWrite);
  assert.ok(codeWrite.limits.some((item) => /approve|merge/i.test(item)));
  assert.ok(codeWrite.limits.some((item) => /source branches/i.test(item)));
});
