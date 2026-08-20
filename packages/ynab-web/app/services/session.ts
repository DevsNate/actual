import Service from "@ember/service";

export default class SessionService extends Service {
  readonly #tokenByAuthority = new Map<string, string>();

  adoptToken(authority: string, token: string): void {
    const normalizedAuthority = authority.trim();
    const normalizedToken = token.trim();
    if (!normalizedAuthority || !normalizedToken) {
      throw new Error("A valid session authority and token are required");
    }
    this.#tokenByAuthority.set(normalizedAuthority, normalizedToken);
  }

  clearToken(authority: string): void {
    this.#tokenByAuthority.delete(authority.trim());
  }

  requireToken(authority: string): string {
    const token = this.#tokenByAuthority.get(authority.trim());
    if (!token) {
      throw new Error("No retained Actual session is available");
    }
    return token;
  }
}

declare module "@ember/service" {
  interface Registry {
    session: SessionService;
  }
}
