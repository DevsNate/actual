import type { AuthenticationError } from '@actual-app/semantic-core';

import { resolveActualPrincipal } from './session-principal-adapter';
import type { ActualAuthDependencies } from './session-principal-adapter';

function dependencies(
  overrides: Partial<ActualAuthDependencies> = {},
): ActualAuthDependencies {
  return {
    findSession: () => ({ user_id: 'user-1', expires_at: 2_000_000_000 }),
    findUser: () => ({
      id: 'user-1',
      user_name: 'person@example.com',
      display_name: 'Person',
      role: 'BASIC',
    }),
    now: () => 1_999_999_999_000,
    ...overrides,
  };
}

describe('resolveActualPrincipal', () => {
  it('projects a valid Actual session into a semantic principal', () => {
    expect(resolveActualPrincipal('token', dependencies())).toEqual({
      id: 'user-1',
      loginName: 'person@example.com',
      displayName: 'Person',
      role: 'BASIC',
    });
  });

  it('accepts Actual sessions that never expire', () => {
    const principal = resolveActualPrincipal(
      'token',
      dependencies({
        findSession: () => ({ user_id: 'user-1', expires_at: -1 }),
      }),
    );

    expect(principal.id).toBe('user-1');
  });

  it('rejects missing and expired sessions', () => {
    expect(() =>
      resolveActualPrincipal(
        'token',
        dependencies({ findSession: () => null }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AuthenticationError>>({
        code: 'invalid-session',
      }),
    );

    expect(() =>
      resolveActualPrincipal(
        'token',
        dependencies({ now: () => 2_000_000_000_000 }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AuthenticationError>>({
        code: 'expired-session',
      }),
    );
  });

  it('fails closed when the session and user identities diverge', () => {
    expect(() =>
      resolveActualPrincipal(
        'token',
        dependencies({
          findUser: () => ({
            id: 'user-2',
            user_name: 'person@example.com',
            display_name: 'Person',
            role: 'BASIC',
          }),
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AuthenticationError>>({
        code: 'invalid-principal',
      }),
    );
  });
});
