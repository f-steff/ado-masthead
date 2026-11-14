import assert from "node:assert/strict";
import test from "node:test";
import {
  pipelinePushRequest,
  pipelineTemplateFile,
  validatePipelinePath
} from "../src/extension/shared/pipeline-deploy";

test("pipeline templates map to stable bundled filenames", () => {
  assert.equal(pipelineTemplateFile("review"), "review.yml");
  assert.equal(pipelineTemplateFile("review-native"), "review-native.yml");
});

test("pipeline YAML paths stay inside the repository", () => {
  assert.equal(validatePipelinePath("/masthead/review.yml"), "/masthead/review.yml");
  for (const value of ["masthead/review.yml", "/../secret.yml", "/a//b.yml", "/a\\b.yml", "/a?x", " /a#b"]) {
    assert.throws(() => validatePipelinePath(value), value);
  }
});

test("the push request creates or edits one trusted template only", () => {
  const body = pipelinePushRequest({
    branchRef: "refs/heads/main",
    oldObjectId: "a".repeat(40),
    path: "/masthead/review.yml",
    content: "trigger: none\n",
    exists: false
  });
  assert.deepEqual(body.refUpdates, [{ name: "refs/heads/main", oldObjectId: "a".repeat(40) }]);
  const commits = body.commits as Array<{ changes: Array<Record<string, unknown>> }>;
  assert.equal(commits[0].changes[0].changeType, "add");
  assert.deepEqual(commits[0].changes[0].item, { path: "/masthead/review.yml" });
  assert.deepEqual(commits[0].changes[0].newContent, { content: "trigger: none\n", contentType: "rawtext" });

  const edit = pipelinePushRequest({
    branchRef: "refs/heads/main",
    oldObjectId: "b".repeat(64),
    path: "/masthead/review.yml",
    content: "trigger: none\n",
    exists: true
  });
  assert.equal((edit.commits as Array<{ changes: Array<Record<string, unknown>> }>)[0].changes[0].changeType, "edit");
});
