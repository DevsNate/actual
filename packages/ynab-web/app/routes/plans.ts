import Route from "@ember/routing/route";
import RouterService from "@ember/routing/router-service";
import { service } from "@ember/service";

import type SemanticApiService from "../services/semantic-api";
import type SessionService from "../services/session";

export default class PlansRoute extends Route {
  @service("semantic-api") declare api: SemanticApiService;
  @service declare router: RouterService;
  @service declare session: SessionService;

  beforeModel(): void {
    if (!this.session.isAuthenticated) {
      this.router.replaceWith("login");
    }
  }

  model() {
    return this.api.readCatalog();
  }
}
