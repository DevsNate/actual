import Service, { service } from "@ember/service";
import type { CatalogSnapshot } from "@actual-app/semantic-core";

import config from "../config/environment";
import { parseCatalogResponse } from "../domain/catalog-response";
import type SessionService from "./session";

export default class SemanticApiService extends Service {
  @service declare session: SessionService;

  async readCatalog(signal?: AbortSignal): Promise<CatalogSnapshot> {
    const apiRoot = new URL(config.semanticApiRoot, window.location.origin);
    const token = this.session.requireToken(apiRoot.origin);
    const response = await fetch(
      new URL("catalog", ensureTrailingSlash(apiRoot)),
      {
        credentials: "same-origin",
        headers: { "x-actual-token": token },
        signal,
      },
    );
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new Error(`Catalog request failed with status ${response.status}`);
    }
    return parseCatalogResponse(body);
  }
}

function ensureTrailingSlash(url: URL): URL {
  return new URL(url.pathname.endsWith("/") ? url.href : `${url.href}/`);
}

declare module "@ember/service" {
  interface Registry {
    "semantic-api": SemanticApiService;
  }
}
