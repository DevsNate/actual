import { assert } from "@ember/debug";
import loadConfigFromMeta from "@embroider/config-meta-loader";

const config = loadConfigFromMeta("@actual-app/ynab-web") as unknown;

assert("YNAB Web config must be an object", isRecord(config));
assert("modulePrefix is missing", typeof config.modulePrefix === "string");
assert("locationType is missing", typeof config.locationType === "string");
assert("rootURL is missing", typeof config.rootURL === "string");
assert(
  "semanticApiRoot is missing",
  typeof config.semanticApiRoot === "string",
);
assert("APP config is missing", isRecord(config.APP));

export default config as {
  modulePrefix: string;
  podModulePrefix?: string;
  locationType: string;
  rootURL: string;
  semanticApiRoot: string;
  APP: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
