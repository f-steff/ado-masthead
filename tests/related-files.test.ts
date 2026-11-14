import assert from "node:assert/strict";
import test from "node:test";
import { callerSearchTerms, normalizeRelative, relatedFileCandidates } from "../src";

test("relative script imports and nearby tests become deterministic candidates", () => {
  const candidates = relatedFileCandidates([{
    path: "src/user.ts",
    changeType: "edit",
    content: [
      'import { db } from "./db";',
      'import type { User } from "../shared/user.js";',
      'export * from "./types";',
      'const legacy = require("./legacy");',
      'const lazy = import("./lazy");',
      'import React from "react";'
    ].join("\n")
  }]);
  for (const expected of [
    "src/db.ts",
    "src/db/index.ts",
    "shared/user.ts",
    "src/types.ts",
    "src/types/index.ts",
    "src/legacy.ts",
    "src/lazy.ts",
    "src/user.test.ts",
    "src/user.spec.ts",
    "src/__tests__/user.test.ts"
  ]) {
    assert.ok(candidates.includes(expected), expected);
  }
  assert.ok(!candidates.includes("react"));
  assert.ok(!candidates.includes("src/user.ts"));
});

test("candidates are deduplicated across changed files", () => {
  const candidates = relatedFileCandidates([
    { path: "src/a.ts", changeType: "edit", content: 'import "./shared";' },
    { path: "src/b.ts", changeType: "edit", content: 'import "./shared";' }
  ]);
  assert.equal(candidates.filter((value) => value === "src/shared.ts").length, 1);
});

test("test files do not recursively nominate more test files", () => {
  const candidates = relatedFileCandidates([{
    path: "src/user.test.ts",
    changeType: "edit",
    content: 'import { normalizeEmail } from "./user";'
  }]);
  assert.ok(candidates.includes("src/user.ts"));
  assert.ok(!candidates.some((value) => /\.(test|spec)\.[a-z]+$/.test(value) || value.includes("__tests__")));
});

test("relative Python imports and tests are resolved from the package", () => {
  const candidates = relatedFileCandidates([{
    path: "pkg/service.py",
    changeType: "edit",
    content: ["from .models import User", "from ..shared.util import helper"].join("\n")
  }]);
  for (const expected of [
    "pkg/models.py",
    "pkg/models/__init__.py",
    "shared/util.py",
    "shared/util/__init__.py",
    "pkg/test_service.py",
    "pkg/service_test.py",
    "pkg/tests/test_service.py"
  ]) {
    assert.ok(candidates.includes(expected), expected);
  }
});

test("caller search uses a small bounded set of exported names", () => {
  const terms = callerSearchTerms([{
    path: "src/user.ts",
    changeType: "edit",
    content: [
      "export function handle() {}",
      "export function normalizeEmail(user: User) { return user.email; }",
      "export class UserProfile {}",
      "export const PROFILE_LIMIT = 10;",
      "const hidden = 1;"
    ].join("\n")
  }, {
    path: "pkg/service.py",
    changeType: "edit",
    content: "def handle_request(payload):\n    return payload"
  }]);
  assert.deepEqual(terms, ["normalizeEmail", "UserProfile", "handle_request"]);
  assert.ok(!terms.includes("PROFILE_LIMIT"));
  assert.ok(!terms.includes("hidden"));
  assert.ok(!terms.includes("handle"));
});

test("caller search is capped and ignores deleted or content-free files", () => {
  const content = Array.from({ length: 20 }, (_, index) => `export function symbol${index}Name() {}`).join("\n");
  const terms = callerSearchTerms([
    { path: "src/many.ts", changeType: "edit", content },
    { path: "src/removed.ts", changeType: "delete", content: "export function removedSymbol() {}" },
    { path: "src/empty.ts", changeType: "edit" }
  ]);
  assert.equal(terms.length, 3);
  assert.deepEqual(terms, ["symbol0Name", "symbol1Name", "symbol2Name"]);
});

test("normalization refuses paths outside the repository", () => {  assert.equal(normalizeRelative("src\\user.ts"), "src/user.ts");
  assert.equal(normalizeRelative("/src/user.ts"), "src/user.ts");
  assert.equal(normalizeRelative("../secret.ts"), undefined);
  assert.equal(normalizeRelative("src/../../secret.ts"), undefined);
  assert.equal(normalizeRelative(""), undefined);
  assert.equal(normalizeRelative("src/\u0000user.ts"), undefined);
});
