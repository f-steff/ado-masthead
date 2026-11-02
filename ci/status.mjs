// GitHub commit statuses are written with explicit API fields. Passing JSON
// through inherited stdin was ignored by spawnSync and failed after the
// Marketplace upload had already succeeded.
export function buildStatusArgs(repository, sha, extension, version) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository) ||
      !/^[0-9a-f]{40}$/i.test(sha) ||
      !["masthead", "masthead-dev"].includes(extension) ||
      !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Invalid release status input.");
  }
  return [
    "api",
    "--method",
    "POST",
    `repos/${repository}/statuses/${sha}`,
    "-f",
    "state=success",
    "-f",
    `context=Marketplace: ${extension}`,
    "-f",
    `description=Published Masthead ${version}`,
    "-f",
    `target_url=https://marketplace.visualstudio.com/items?itemName=f-steff.${extension}`
  ];
}
