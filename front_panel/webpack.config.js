"use strict";

const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

/** Uncompressed size ceiling per emitted asset and per entrypoint. */
const SIZE_BUDGET_BYTES = 700_000;

module.exports = (_env, argv) => {
    const isProduction = argv.mode === "production";

    return {
        entry: { main: "./src/main.js" },
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: isProduction ? "[name].[contenthash].js" : "[name].js",
            chunkFilename: isProduction ? "[name].[contenthash].js" : "[name].js",
            publicPath: "/",
            clean: true,
        },
        // No eval-based devtool: the host serves a CSP with script-src 'self'.
        devtool: isProduction ? "source-map" : "cheap-module-source-map",
        plugins: [
            new webpack.DefinePlugin({ __DEV__: JSON.stringify(!isProduction) }),
            new HtmlWebpackPlugin({
                template: "./src/index.html",
                scriptLoading: "module",
                minify: false,
            }),
        ],
        performance: {
            hints: isProduction ? "error" : false,
            maxAssetSize: SIZE_BUDGET_BYTES,
            maxEntrypointSize: SIZE_BUDGET_BYTES,
            assetFilter: (name) => name.endsWith(".js"),
        },
        stats: "errors-warnings",
    };
};
