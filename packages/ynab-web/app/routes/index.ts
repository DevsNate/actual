import Route from "@ember/routing/route";
import RouterService from "@ember/routing/router-service";
import { service } from "@ember/service";

import type SessionService from "../services/session";

export default class IndexRoute extends Route {
  @service declare router: RouterService;
  @service declare session: SessionService;

  beforeModel(): void {
    this.router.replaceWith(this.session.isAuthenticated ? "plans" : "login");
  }
}
