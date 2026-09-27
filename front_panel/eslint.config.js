"use strict";

const js = require("@eslint/js");
const globals = require("globals");
const importX = require("eslint-plugin-import-x");

/** Rules shared by browser and Node code. */
const baseRules = {
    "no-var": "error",
    "prefer-const": "error",
    eqeqeq: ["error", "always"],
    "no-implicit-globals": "error",
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    "no-console": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-throw-literal": "error",
    "prefer-promise-reject-errors": "error",
    "no-return-await": "off",
    "no-param-reassign": ["error", { props: false }],
    "no-shadow": "error",
    "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
    "import-x/no-cycle": ["error", { maxDepth: Infinity }],
    "import-x/no-default-export": "error",
    "import-x/no-unresolved": "off",
    "import-x/named": "off",
};

module.exports = [
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**"],
    },
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        plugins: { "import-x": importX },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...globals.browser, __DEV__: "readonly" },
        },
        settings: {
            "import-x/resolver": { node: { extensions: [".js"] } },
        },
        rules: baseRules,
    },
    {
        files: ["src/util/logger.js"],
        rules: { "no-console": "off" },
    },
    {
        files: ["server/**/*.js", "scripts/**/*.js", "*.config.js", "webpack.config.js"],
        plugins: { "import-x": importX },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "commonjs",
            globals: { ...globals.node },
        },
        rules: { ...baseRules, "no-console": "off" },
    },
    {
        files: ["**/*.test.js", "test/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...globals.browser, ...globals.node, __DEV__: "readonly" },
        },
        rules: { "no-console": "off", "no-unused-vars": "off" },
    },
];
