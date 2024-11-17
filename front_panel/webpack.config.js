const path = require("path");

module.exports = {
    entry: {
        main: "./src/script.js",
        control2: "./src/control2/main_control2.js",
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "dist"),
    },
};
