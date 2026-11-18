import assert from "node:assert/strict";
import test from "node:test";
import { LENS_EXAMPLES, REVIEW_LENSES } from "../src";

test("every review lens has complete in-product examples in C", () => {
  assert.ok(REVIEW_LENSES.length > 0);
  for (const lens of REVIEW_LENSES) {
    const example = LENS_EXAMPLES[lens.id];
    assert.ok(example, lens.id);
    assert.ok(example.whenToUse.trim(), `${lens.id} whenToUse`);
    assert.ok(example.cases.length >= 2, `${lens.id} cases`);
    for (const item of example.cases) {
      assert.ok(item.name.trim(), `${lens.id} case name`);
      assert.ok(item.input.trim(), `${lens.id} input`);
      assert.ok(item.output.trim(), `${lens.id} output`);
      assert.match(item.output, /Suggestion:/i);
      assert.match(item.output, /src|migrations|test|CMake/i);
    }
  }
});

test("the examples include harder C failure classes", () => {
  const correctness = LENS_EXAMPLES.correctness.cases.map((item) => item.name.toLowerCase()).join(" ");
  assert.match(correctness, /off-by-one|deref|ignored/);
  const security = LENS_EXAMPLES.security.cases.map((item) => item.name.toLowerCase()).join(" ");
  assert.match(security, /sql|traversal/);
  assert.ok(LENS_EXAMPLES.architecture.cases.length >= 2);
});
