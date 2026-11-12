import assert from "node:assert/strict";
import test from "node:test";
import { LENS_EXAMPLES, REVIEW_LENSES } from "../src";

test("every review lens has a complete in-product example", () => {
  assert.ok(REVIEW_LENSES.length > 0);
  for (const lens of REVIEW_LENSES) {
    const example = LENS_EXAMPLES[lens.id];
    assert.ok(example, lens.id);
    assert.ok(example.whenToUse.trim(), `${lens.id} whenToUse`);
    assert.ok(example.input.trim(), `${lens.id} input`);
    assert.ok(example.output.trim(), `${lens.id} output`);
    assert.match(example.output, /Suggestion:/i);
    assert.match(example.output, /src|migrations|test|package/i);
  }
});
