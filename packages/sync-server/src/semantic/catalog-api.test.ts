import type {
  AuthenticatedPrincipal,
  CatalogReader,
} from '@actual-app/semantic-core';
import { AuthenticationError } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createSemanticCatalogHandlers } from './catalog-api';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

function createApp(
  catalogReader: CatalogReader,
  resolvePrincipal: (sessionToken: string) => AuthenticatedPrincipal = () =>
    principal,
): express.Express {
  const app = express();
  app.use(
    '/semantic/v1',
    createSemanticCatalogHandlers({ catalogReader, resolvePrincipal }),
  );
  return app;
}

describe('semantic catalog API', () => {
  test('requires an Actual session token', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn(),
    };
    const app = createApp(catalogReader, token => {
      if (!token) {
        throw new AuthenticationError(
          'invalid-session',
          'A session is required',
        );
      }
      return principal;
    });

    await request(app).get('/semantic/v1/catalog').expect(401, {
      status: 'error',
      reason: 'invalid-session',
    });
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });

  test('reads only the authenticated principal catalog', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn().mockResolvedValue({
        knowledge: {
          principalId: 'principal-1',
          currentServerKnowledge: 3,
        },
        memberships: [],
      }),
    };
    const app = createApp(catalogReader);

    await request(app)
      .get('/semantic/v1/catalog')
      .set('x-actual-token', 'actual-session')
      .expect(200, {
        status: 'ok',
        data: {
          knowledge: {
            principalId: 'principal-1',
            currentServerKnowledge: 3,
          },
          memberships: [],
        },
      });
    expect(catalogReader.readCatalog).toHaveBeenCalledExactlyOnceWith(
      'principal-1',
    );
  });

  test('does not expose storage errors or partial catalog data', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const catalogReader: CatalogReader = {
        readCatalog: vi.fn().mockRejectedValue(new Error('database detail')),
      };
      const app = createApp(catalogReader);

      await request(app)
        .get('/semantic/v1/catalog')
        .set('x-actual-token', 'actual-session')
        .expect(500, {
          status: 'error',
          reason: 'semantic-catalog-unavailable',
        });
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});
