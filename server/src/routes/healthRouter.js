const express = require("express");
const { healthController } = require("../controllers/healthController");

const healthRouter = express.Router();

healthRouter.get("/api/health", healthController);

module.exports = healthRouter;
