const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

app.use(express.static(__dirname));

app.use(
    "/ws",
    createProxyMiddleware({
        target: "ws://0.0.0.0:8999",
        ws: true,
    })
);

app.use(express.static("dist"));
app.use(express.static("public"));

app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

const server = app.listen(9000, function () {
    console.log("front_panel server running at http://localhost:9000");
});
