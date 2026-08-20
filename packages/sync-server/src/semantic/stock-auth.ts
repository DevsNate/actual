import { AuthenticationError } from '@actual-app/semantic-core';
import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import type express from 'express';

export function authenticateStockTokenRequest(
  request: express.Request,
  response: express.Response,
  resolvePrincipal: (sessionToken: string) => AuthenticatedPrincipal,
): AuthenticatedPrincipal | null {
  const sessionToken = tokenAuthorization(request.get('authorization'));
  if (!sessionToken) {
    response.status(401).send({ error: { id: 'invalid-session' } });
    return null;
  }
  try {
    return resolvePrincipal(sessionToken);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      response.status(401).send({ error: { id: error.code } });
      return null;
    }
    throw error;
  }
}

function tokenAuthorization(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = /^Token\s+(.+)$/u.exec(value.trim());
  return match?.[1]?.trim() || null;
}
