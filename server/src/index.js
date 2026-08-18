const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const routes = require("./routes");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(routes);

app.get("/", (req, res) => res.send("ecommerce-rag-ai server running"));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
