import { AuthenticationError } from '@actual-app/semantic-core';
import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import express from 'express';

import { projectStockUser } from './stock-user-projection';

type Dependencies = {
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createStockUserGateway(dependencies: Dependencies) {
  const handlers = express.Router();
  handlers.get('/user', (request, response) => {
    let principal: AuthenticatedPrincipal;
    try {
      principal = dependencies.resolvePrincipal(
        request.get('x-session-token') ?? '',
      );
    } catch (error) {
      if (error instanceof AuthenticationError) {
        response.status(401).send({ error: { id: error.code } });
        return;
      }
      throw error;
    }
    const user = projectStockUser(principal);
    response.send({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      family_role: user.family_role,
      confirmed: true,
      is_tombstone: false,
    });
  });
  return handlers;
}
