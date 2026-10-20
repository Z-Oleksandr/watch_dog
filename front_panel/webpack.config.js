"use strict";

const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

/** Uncompressed size ceiling per emitted asset and per entrypoint. */
const SIZE_BUDGET_BYTES = 700_000;

const SOURCE_URL = "https://github.com/Z-Oleksandr/watch_dog";

/** Static assets the page needs at runtime; `public/sound` is not used by the panel. */
const DEMO_STATIC_ASSETS = ["css", "fonts", "models", "favicon.png"];

/**
 * Settings of the website demo build (`--env demo`). The demo is
 * self-contained static output that can live under any sub-path.
 *
 * @param {Record<string, string | boolean>} env
 * @returns {{ publicPath: string, returnUrl: string }}
 * @throws {Error} when an option would produce a broken or unsafe page.
 */
function demoOptions(env) {
    const publicPath = typeof env.publicPath === "string" ? env.publicPath : "/";
    const returnUrl = typeof env.returnUrl === "string" ? env.returnUrl : "/";
    if (!/^\/([\w.-]+\/)*$/.test(publicPath)) {
        throw new Error(`demo publicPath must start and end with "/", got ${publicPath}`);
    }
    if (!/^(\/(?!\/)|https:\/\/)[^\s"'<>]*$/.test(returnUrl)) {
        throw new Error(`demo returnUrl must be a site path or an https URL, got ${returnUrl}`);
    }
    return { publicPath, returnUrl };
}

function demoAssetCopies() {
    return new CopyWebpackPlugin({
        patterns: DEMO_STATIC_ASSETS.map((asset) => ({
            from: path.resolve(__dirname, "public", asset),
            to: asset,
        })),
    });
}

module.exports = (env = {}, argv) => {
    const isProduction = argv.mode === "production";
    const isDemo = Boolean(env.demo);
    const demo = isDemo ? demoOptions(env) : null;

    return {
        entry: { main: "./src/main.js" },
        output: {
            path: path.resolve(__dirname, isDemo ? "dist_demo" : "dist"),
            filename: isProduction ? "[name].[contenthash].js" : "[name].js",
            chunkFilename: isProduction ? "[name].[contenthash].js" : "[name].js",
            publicPath: isDemo ? demo.publicPath : "/",
            clean: true,
        },
        // No eval-based devtool: the host serves a CSP with script-src 'self'.
        devtool: isProduction ? "source-map" : "cheap-module-source-map",
        plugins: [
            new webpack.DefinePlugin({
                __DEV__: JSON.stringify(!isProduction),
                __DEMO__: JSON.stringify(isDemo),
            }),
            new HtmlWebpackPlugin({
                template: "./src/index.html",
                scriptLoading: "module",
                minify: false,
                templateParameters: {
                    demo: isDemo,
                    returnUrl: isDemo ? demo.returnUrl : "/",
                    sourceUrl: SOURCE_URL,
                },
            }),
            ...(isDemo ? [demoAssetCopies()] : []),
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
