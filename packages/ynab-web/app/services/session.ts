import Service from "@ember/service";
import { tracked } from "@glimmer/tracking";

import { parseLoginResponse } from "../domain/session-response";

export default class SessionService extends Service {
  readonly #tokenByAuthority = new Map<string, string>();
  @tracked revision = 0;

  get isAuthenticated(): boolean {
    this.revision;
    return this.#tokenByAuthority.size > 0;
  }

  async signInWithPassword(
    password: string,
    authority = window.location.origin,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!password) {
      throw new Error("A password is required");
    }
    const origin = normalizeAuthority(authority);
    const response = await fetch(new URL("/account/login", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, loginMethod: "password" }),
      credentials: "same-origin",
      signal,
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new Error(`Login request failed with status ${response.status}`);
    }
    this.adoptToken(origin, parseLoginResponse(body));
  }

  adoptToken(authority: string, token: string): void {
    const normalizedAuthority = normalizeAuthority(authority);
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error("A valid session authority and token are required");
    }
    this.#tokenByAuthority.set(normalizedAuthority, normalizedToken);
    this.revision++;
  }

  clearToken(authority: string): void {
    if (this.#tokenByAuthority.delete(normalizeAuthority(authority))) {
      this.revision++;
    }
  }

  requireToken(authority: string): string {
    this.revision;
    const token = this.#tokenByAuthority.get(normalizeAuthority(authority));
    if (!token) {
      throw new Error("No retained Actual session is available");
    }
    return token;
  }
}

function normalizeAuthority(authority: string): string {
  return new URL(authority.trim()).origin;
}

declare module "@ember/service" {
  interface Registry {
    session: SessionService;
  }
}
