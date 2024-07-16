require("dotenv").config();
const express = require("express");
const app = express();
const routes = require("./routes");

app.use(express.json());
app.use("/", routes);

app.all("*", (req, res) => {
    res.status(404).send();
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
