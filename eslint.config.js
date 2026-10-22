import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Reglas de seguridad de la constitución (principio I): sin eval y sin inyección de HTML.
const securityRules = {
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "no-restricted-properties": [
    "error",
    { object: "document", property: "write", message: "Prohibido: inyección de HTML." },
    { object: "document", property: "writeln", message: "Prohibido: inyección de HTML." },
    { property: "insertAdjacentHTML", message: "Prohibido: inyección de HTML." },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector:
        "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
      message: "Prohibido: asignar innerHTML/outerHTML. Muestra el contenido como texto.",
    },
    {
      selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
      message: "Prohibido: dangerouslySetInnerHTML. Muestra el contenido como texto.",
    },
    {
      selector: "NewExpression[callee.name='Function']",
      message: "Prohibido: generar código en tiempo de ejecución.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-test/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.turbo/**",
      ".specify/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...securityRules,
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: securityRules,
  },
  {
    files: ["apps/extension/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["apps/extension/e2e/fixtures/conflict-extension/**/*.js"],
    languageOptions: { globals: { ...globals.serviceworker, chrome: "readonly" } },
  },
);
