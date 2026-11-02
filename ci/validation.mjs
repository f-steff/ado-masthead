// Marketplace validation is asynchronous. TFX's own wait has a short timeout;
// the release must poll the status explicitly before tagging or reporting success.
export function parseValidationStatus(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Marketplace validation status was not valid JSON.");
  }
  let value;
  try {
    value = JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error("Marketplace validation status was not valid JSON.");
  }
  if (!value || typeof value !== "object" || typeof value.status !== "string") {
    throw new Error("Marketplace validation status has an invalid shape.");
  }
  if (value.status === "success") return { status: "success" };
  if (value.status === "pending") return { status: "pending" };
  return {
    status: "error",
    message: typeof value.message === "string" && value.message.trim()
      ? value.message.trim().slice(0, 500)
      : "Marketplace validation failed."
  };
}
