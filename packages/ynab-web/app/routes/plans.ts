import Route from "@ember/routing/route";
import { service } from "@ember/service";

import type SemanticApiService from "../services/semantic-api";

export default class PlansRoute extends Route {
  @service("semantic-api") declare api: SemanticApiService;

  model() {
    return this.api.readCatalog();
  }
}
