const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(9000, function () {
    console.log("front_panel server running at http://localhost:9000");
});
