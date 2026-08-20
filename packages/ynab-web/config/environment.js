"use strict";

module.exports = function (environment) {
  const ENV = {
    modulePrefix: "@actual-app/ynab-web",
    environment,
    rootURL: "/",
    locationType: "history",
    semanticApiRoot: "/semantic/v1/",
    EmberENV: {
      EXTEND_PROTOTYPES: false,
    },
    APP: {},
  };

  if (environment === "test") {
    ENV.locationType = "none";
    ENV.APP.rootElement = "#ember-testing";
    ENV.APP.autoboot = false;
  }

  return ENV;
};
