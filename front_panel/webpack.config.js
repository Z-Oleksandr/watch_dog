const path = require("path");

module.exports = {
    entry: {
        main: "./src/script.js",
    },
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, "dist"),
    },
};
