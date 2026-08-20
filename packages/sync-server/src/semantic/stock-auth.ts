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
  const credential = match?.[1]?.trim();
  if (!credential) {
    return null;
  }

  // The stock Direct Import client serializes its credential as
  // `Authorization: Token token=<session>`, while other stock Web clients use
  // `Authorization: Token <session>`. Both carry the same authenticated
  // session identity; normalize only the observed Direct Import wrapper here
  // so individual domain gateways do not grow protocol-specific auth hacks.
  if (credential.startsWith('token=')) {
    return credential.slice('token='.length).trim() || null;
  }
  return credential;
}
