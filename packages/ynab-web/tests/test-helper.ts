import Application from "@actual-app/ynab-web/app";
import config from "@actual-app/ynab-web/config/environment";
import { setApplication } from "@ember/test-helpers";
import { setupEmberOnerrorValidation, start as qunitStart } from "ember-qunit";
import * as QUnit from "qunit";
import { setup } from "qunit-dom";

export function start(): void {
  setApplication(Application.create(config.APP));
  setup(QUnit.assert);
  setupEmberOnerrorValidation();
  qunitStart();
}
