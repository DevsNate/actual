import { AuthenticationError } from '@actual-app/semantic-core';
import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';

import { getSession, getUserInfo } from '#account-db';

type ActualSession = {
  user_id?: unknown;
  expires_at?: unknown;
};

type ActualUser = {
  id?: unknown;
  user_name?: unknown;
  display_name?: unknown;
  role?: unknown;
};

export type ActualAuthDependencies = {
  findSession(token: string): ActualSession | null | undefined;
  findUser(userId: string): ActualUser | null | undefined;
  now(): number;
};

const defaultDependencies: ActualAuthDependencies = {
  findSession: getSession,
  findUser: getUserInfo,
  now: Date.now,
};

/** Project a validated Actual session into the shared semantic identity. */
export function resolveActualPrincipal(
  sessionToken: string,
  dependencies: ActualAuthDependencies = defaultDependencies,
): AuthenticatedPrincipal {
  if (sessionToken.trim().length === 0) {
    throw new AuthenticationError(
      'invalid-session',
      'An Actual session token is required',
    );
  }

  const session = dependencies.findSession(sessionToken);
  if (!session) {
    throw new AuthenticationError(
      'invalid-session',
      'The Actual session is invalid',
    );
  }

  const expiresAt = requireFiniteNumber(session.expires_at, 'expires_at');
  if (expiresAt !== -1 && expiresAt <= dependencies.now()) {
    throw new AuthenticationError(
      'expired-session',
      'The Actual session has expired',
    );
  }

  const userId = requireNonEmptyString(session.user_id, 'session.user_id');
  const user = dependencies.findUser(userId);
  if (!user) {
    throw new AuthenticationError(
      'invalid-principal',
      'The Actual session principal does not exist',
    );
  }

  const id = requireNonEmptyString(user.id, 'user.id');
  if (id !== userId) {
    throw new AuthenticationError(
      'invalid-principal',
      'The Actual session principal does not match the user record',
    );
  }

  return {
    id,
    loginName: requireString(user.user_name, 'user.user_name'),
    displayName: requireString(user.display_name, 'user.display_name'),
    role: requireNonEmptyString(user.role, 'user.role'),
  };
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AuthenticationError(
      'invalid-session',
      `${label} must be a finite number`,
    );
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new AuthenticationError(
      'invalid-principal',
      `${label} must be a string`,
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (result.trim().length === 0) {
    throw new AuthenticationError(
      'invalid-principal',
      `${label} must not be empty`,
    );
  }
  return result;
}
