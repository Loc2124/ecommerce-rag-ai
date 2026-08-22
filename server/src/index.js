const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const swaggerUi = require("swagger-ui-express");

const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const routes = require("./routes");
const swaggerDocument = require("./swagger");

const app = express();
const port = process.env.PORT || 3000;
app.set("trust proxy", process.env.TRUST_PROXY === "true");
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(helmet());
app.use(bodyParser.json({ limit: "100kb" }));
if (process.env.NODE_ENV !== "production") {
  app.get("/api-docs.json", (req, res) => res.json(swaggerDocument));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}
app.use(routes);

app.get("/", (req, res) => res.send("ecommerce-rag-ai server running"));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
