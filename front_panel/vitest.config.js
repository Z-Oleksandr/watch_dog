"use strict";

const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
    define: { __DEV__: "false" },
    test: {
        include: ["src/**/*.test.js", "server/**/*.test.js", "scripts/**/*.test.js"],
        environment: "node",
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**/*.js", "server/**/*.js"],
            exclude: ["**/*.test.js", "src/main.js"],
        },
    },
});
