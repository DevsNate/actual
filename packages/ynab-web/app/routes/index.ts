import Route from "@ember/routing/route";
import RouterService from "@ember/routing/router-service";
import { service } from "@ember/service";

export default class IndexRoute extends Route {
  @service declare router: RouterService;

  beforeModel(): void {
    this.router.replaceWith("plans");
  }
}
