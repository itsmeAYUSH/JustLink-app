import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Saved links point at arbitrary third-party hosts, so we render plain <img>
      // instead of next/image (which needs every remote host allow-listed).
      "@next/next/no-img-element": "off",
      // Allow `const { unwanted, ...rest } = row` to drop fields.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
