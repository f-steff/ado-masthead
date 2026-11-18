// Data-driven permission explorer shared by the settings pages. Keeping the
// scope list in one place prevents the UI and the permission documentation from
// drifting apart.
export interface PermissionDefinition {
  id: string;
  scope: string;
  name: string;
  highPrivilege: boolean;
  summary: string;
  why: string;
  limits: string[];
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  {
    id: "code-write",
    scope: "vso.code_write",
    name: "Code (read and write)",
    highPrivilege: true,
    summary: "Writes only the bundled Masthead pipeline YAML and the Masthead status policy.",
    why: "An administrator can commit the packaged review.yml or review-native.yml to the trusted repository selected in Setup, and can create, require or remove only the Masthead status policy on a repository default branch.",
    limits: [
      "Does not push application source branches or pull request branches.",
      "Does not edit branch policies other than the Masthead status policy.",
      "Does not approve, vote on, complete or merge pull requests."
    ]
  },
  {
    id: "build-execute",
    scope: "vso.build_execute",
    name: "Build (read and execute)",
    highPrivilege: true,
    summary: "Creates or deletes the Masthead review pipeline definition.",
    why: "Setup creates the YAML pipeline definition after writing or checking the template. Deleting the review pipeline from Setup also uses this scope.",
    limits: [
      "The extension does not queue builds from the browser.",
      "Does not modify application pipelines.",
      "Does not manage agents, environments or deployment resources."
    ]
  },
  {
    id: "build-read",
    scope: "vso.build",
    name: "Build (read)",
    highPrivilege: false,
    summary: "Lists and validates pipeline definitions.",
    why: "Setup needs to check whether a pipeline name already exists, read its YAML path and repository, and bind the selected definition.",
    limits: [
      "Read-only. It cannot change a definition without Build (read and execute)."
    ]
  },
  {
    id: "code-read",
    scope: "vso.code",
    name: "Code (read)",
    highPrivilege: false,
    summary: "Reads pull requests, files and code-search results.",
    why: "The extension discovers repositories and reads pull request metadata for the settings pages. The review worker uses the same scope to read changed files, related files and caller candidates.",
    limits: [
      "Read-only. It cannot push code or change pull request state."
    ]
  },
  {
    id: "extension-data",
    scope: "vso.extension.data_write",
    name: "Extension data (read and write)",
    highPrivilege: false,
    summary: "Stores Masthead settings, the model catalogue and the revision lock.",
    why: "Organization and project settings are extension data documents. The worker also writes the revision lock and refreshes the non-secret model catalogue.",
    limits: [
      "Provider keys are never stored in extension data.",
      "Repository content and pull request discussion are not stored there."
    ]
  },
  {
    id: "project-read",
    scope: "vso.project",
    name: "Project and team (read)",
    highPrivilege: false,
    summary: "Lists projects and repositories.",
    why: "The organization and project pages need the project and repository list to show review gates and repository policy state.",
    limits: [
      "Read-only. It cannot create, update or delete projects or teams."
    ]
  }
];

/** Render the scope list and its detail panel using the lens-example layout. */
export function renderPermissionExplorer(
  nav: HTMLElement | null,
  panel: HTMLElement | null
): void {
  if (!nav || !panel) return;
  nav.replaceChildren();
  let selected = PERMISSIONS[0].id;
  const buttons = new Map<string, HTMLButtonElement>();

  const show = (id: string): void => {
    selected = id;
    for (const [buttonId, button] of buttons) {
      const active = buttonId === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    const permission = PERMISSIONS.find((item) => item.id === id);
    if (!permission) return;
    panel.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = permission.scope;
    const name = document.createElement("p");
    name.className = "meta";
    name.textContent = permission.name;
    const badge = document.createElement("span");
    badge.className = permission.highPrivilege ? "permission-badge high" : "permission-badge read";
    badge.textContent = permission.highPrivilege ? "High privilege" : "Standard access";
    const summary = document.createElement("p");
    summary.textContent = permission.summary;
    const whyHeading = document.createElement("h4");
    whyHeading.textContent = "Why Masthead needs it";
    const why = document.createElement("p");
    why.textContent = permission.why;
    const limitsHeading = document.createElement("h4");
    limitsHeading.textContent = "What it does not do";
    const limits = document.createElement("ul");
    for (const item of permission.limits) {
      const entry = document.createElement("li");
      entry.textContent = item;
      limits.append(entry);
    }
    panel.append(heading, name, badge, summary, whyHeading, why, limitsHeading, limits);
  };

  for (const permission of PERMISSIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-tab";
    button.id = `permission-${permission.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.textContent = permission.name;
    button.addEventListener("click", () => show(permission.id));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = PERMISSIONS.findIndex((item) => item.id === selected);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = PERMISSIONS[(index + delta + PERMISSIONS.length) % PERMISSIONS.length];
      buttons.get(next.id)?.focus();
      show(next.id);
    });
    buttons.set(permission.id, button);
    nav.append(button);
  }
  show(selected);
}
