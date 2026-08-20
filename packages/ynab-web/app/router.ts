import Router from "@embroider/router";

import config from "./config/environment";

export default class AppRouter extends Router {
  location = config.locationType;
  rootURL = config.rootURL;
}

AppRouter.map(function () {
  this.route("plans");
  this.route("plan", { path: "/plans/:plan_id" });
});
