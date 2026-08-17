import { AuthenticationError } from '@actual-app/semantic-core';
import type {
  AuthenticatedPrincipal,
  CatalogReader,
} from '@actual-app/semantic-core';
import express from 'express';

export type SemanticCatalogApiDependencies = {
  catalogReader: CatalogReader;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticCatalogHandlers(
  dependencies: SemanticCatalogApiDependencies,
): express.Router {
  const handlers = express.Router();

  handlers.get('/catalog', async (request, response) => {
    const principal = authenticateRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }

    try {
      const catalog = await dependencies.catalogReader.readCatalog(
        principal.id,
      );
      response.status(200).send({ status: 'ok', data: catalog });
    } catch (error) {
      console.error('Semantic catalog read failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-catalog-unavailable',
      });
    }
  });

  return handlers;
}

function authenticateRequest(
  sessionToken: string | undefined,
  response: express.Response,
  dependencies: SemanticCatalogApiDependencies,
): AuthenticatedPrincipal | null {
  try {
    return dependencies.resolvePrincipal(sessionToken ?? '');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      response.status(401).send({
        status: 'error',
        reason: error.code,
      });
      return null;
    }
    throw error;
  }
}
