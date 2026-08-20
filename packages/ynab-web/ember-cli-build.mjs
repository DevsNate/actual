import { compatBuild } from "@embroider/compat";
import { buildOnce } from "@embroider/vite";
import EmberApp from "ember-cli/lib/broccoli/ember-app.js";

export default function build(defaults) {
  const app = new EmberApp(defaults, {});
  return compatBuild(app, buildOnce);
}
