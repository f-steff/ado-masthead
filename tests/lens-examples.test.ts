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
      assert.match(item.output, /src|migrations|test|CMake|config/i);
    }
  }
});

test("examples stay printable ASCII so copied code is unambiguous", () => {
  for (const lens of REVIEW_LENSES) {
    const example = LENS_EXAMPLES[lens.id];
    const values = [
      example.whenToUse,
      ...example.cases.flatMap((item) => [item.name, item.input, item.output])
    ];
    for (const value of values) {
      assert.match(value, /^[\x09\x0A\x0D\x20-\x7E]*$/, lens.id);
    }
  }
});

test("the examples use embedded and RTOS failure classes", () => {
  const text = (lens: (typeof REVIEW_LENSES)[number]["id"]): string =>
    LENS_EXAMPLES[lens].cases.map((item) => `${item.name} ${item.input} ${item.output}`).join(" ").toLowerCase();
  assert.match(text("correctness"), /ring buffer|uart|isr|shared sample/);
  assert.match(text("security"), /radio|packet|debug shell/);
  assert.match(text("performance"), /busy-wait|flash|interrupt/);
  assert.match(text("architecture"), /gpio|rtos|isr/);
  assert.match(text("data"), /nvs|configuration|calibration/);
  assert.match(text("dependencies"), /vendor|cmake/);
});
