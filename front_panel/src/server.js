const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

app.use(express.static(__dirname));

app.use(
    "/ws",
    createProxyMiddleware({
        target: "wss://theblog.sbmedia.cloud:8999",
        ws: true,
    })
);

app.use(express.static("dist"));
app.use(express.static("public"));

app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

const server = app.listen(9000, function () {
    console.log("front_panel listening at port 9000");
});
