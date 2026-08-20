import { babel } from "@rollup/plugin-babel";
import { classicEmberSupport, ember, extensions } from "@embroider/vite";
import { defineConfig } from "vite";

const apiOrigin = process.env.YNAB_WEB_API_ORIGIN ?? "http://localhost:5006";

export default defineConfig({
  plugins: [
    classicEmberSupport(),
    ember(),
    babel({ babelHelpers: "runtime", extensions }),
  ],
  server: {
    proxy: {
      "/account": apiOrigin,
      "/semantic": apiOrigin,
    },
  },
});
