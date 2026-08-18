const express = require("express");
const { chatAIController } = require("../controllers/aiController");

const aiRouter = express.Router();

aiRouter.post("/api/rag/chat", chatAIController);

module.exports = aiRouter;
