// Shared review-profile controls. The lens catalogue is the source of truth, so
// organization, project and repository editors cannot drift from the prompt.
import { REVIEW_LENSES, ReviewLensId } from "../../review/lenses";

/** Render one checkbox per lens and keep correctness visibly mandatory. */
export function renderLensOptions(
  container: HTMLElement | null,
  selected: readonly ReviewLensId[],
  disabled = false
): void {
  if (!container) return;
  container.replaceChildren();
  const selectedSet = new Set(selected);
  for (const lens of REVIEW_LENSES) {
    const label = document.createElement("label");
    label.className = "lens-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = lens.id;
    input.checked = lens.mandatory || selectedSet.has(lens.id);
    input.disabled = disabled || lens.mandatory;
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = lens.name;
    const summary = document.createElement("small");
    summary.textContent = lens.summary;
    copy.append(name, summary);
    label.append(input, copy);
    container.append(label);
  }
}

/** Read the selected lenses; correctness is always supplied by the caller. */
export function selectedLenses(container: HTMLElement | null): ReviewLensId[] {
  if (!container) return ["correctness"];
  return Array.from(container.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked"))
    .map((input) => input.value)
    .filter((value): value is ReviewLensId => REVIEW_LENSES.some((lens) => lens.id === value));
}

/** Disable an entire profile editor without losing its current choices. */
export function setLensOptionsDisabled(container: HTMLElement | null, disabled: boolean): void {
  if (!container) return;
  for (const input of container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
    const lens = REVIEW_LENSES.find((item) => item.id === input.value);
    input.disabled = disabled || lens?.mandatory === true;
  }
}
