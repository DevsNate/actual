export function parseLoginResponse(value: unknown): string {
  const envelope = requireRecord(value, "login response");
  if (envelope.status !== "ok") {
    const reason =
      typeof envelope.reason === "string" ? envelope.reason : "login-failed";
    throw new Error(`Login failed: ${reason}`);
  }
  const data = requireRecord(envelope.data, "login data");
  if (typeof data.token !== "string" || !data.token.trim()) {
    throw new Error("Login response did not include a session token");
  }
  return data.token;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
