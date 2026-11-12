// One compact explorer shared by organization and project settings. The lens
// catalogue and examples remain data-driven so a new lens cannot be added
// without an example.
import { LENS_EXAMPLES } from "../../review/lens-examples";
import { REVIEW_LENSES, ReviewLensId } from "../../review/lenses";

/** Render a single-lens example explorer into the supplied containers. */
export function renderLensExamples(
  tabs: HTMLElement | null,
  panel: HTMLElement | null,
  initial: ReviewLensId = "correctness"
): void {
  if (!tabs || !panel) return;
  tabs.replaceChildren();
  let selected = initial;
  const buttons = new Map<ReviewLensId, HTMLButtonElement>();

  const show = (lensId: ReviewLensId): void => {
    selected = lensId;
    for (const [id, button] of buttons) {
      const active = id === lensId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    const lens = REVIEW_LENSES.find((item) => item.id === lensId);
    const example = LENS_EXAMPLES[lensId];
    if (!lens) return;
    panel.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = lens.name;
    const summary = document.createElement("p");
    summary.className = "note";
    summary.textContent = lens.summary;
    const when = document.createElement("p");
    const whenLabel = document.createElement("strong");
    whenLabel.textContent = "When to use: ";
    when.append(whenLabel, document.createTextNode(example.whenToUse));
    const inputHeading = document.createElement("h4");
    inputHeading.textContent = "Example input";
    const input = document.createElement("pre");
    input.textContent = example.input;
    const outputHeading = document.createElement("h4");
    outputHeading.textContent = "Expected review finding";
    const output = document.createElement("pre");
    output.textContent = example.output;
    panel.append(heading, summary, when, inputHeading, input, outputHeading, output);
  };

  for (const lens of REVIEW_LENSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-tab";
    button.id = `example-${lens.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.textContent = lens.name;
    button.addEventListener("click", () => show(lens.id));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = REVIEW_LENSES.findIndex((item) => item.id === selected);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = REVIEW_LENSES[(index + delta + REVIEW_LENSES.length) % REVIEW_LENSES.length];
      buttons.get(next.id)?.focus();
      show(next.id);
    });
    buttons.set(lens.id, button);
    tabs.append(button);
  }
  show(initial);
}
