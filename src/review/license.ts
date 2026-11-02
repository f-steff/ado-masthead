// Applies the repository-license rule before any model call. This is deliberately
// small: the AI lens interprets license evidence, while this function guarantees
// the agreed missing-LICENSE warning is emitted exactly once.
import { RepositoryLicense } from "./types";

const LICENSE_FILE_NAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt"
];

/** Only a root LICENSE convention establishes the requested repository policy. */
export function detectRepositoryLicense(
  files: Readonly<Record<string, string>>
): RepositoryLicense {
  const path = LICENSE_FILE_NAMES.find((candidate) => {
    const keys = Object.keys(files);
    return keys.some((key) => key.replace(/\\/g, "/").toLowerCase() === candidate.toLowerCase());
  });

  if (!path) {
    return {
      missing: true,
      warning:
        "No root LICENSE file was found. Add a license or confirm the intended repository policy."
    };
  }

  const actualPath = Object.keys(files).find(
    (key) => key.replace(/\\/g, "/").toLowerCase() === path.toLowerCase()
  );

  return {
    path: actualPath,
    text: files[actualPath ?? path] ?? "",
    missing: false
  };
}
