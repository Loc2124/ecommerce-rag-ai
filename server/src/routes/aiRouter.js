const express = require("express");
const {
  chatAIController,
  getChatHistoryController,
} = require("../controllers/aiController");
const requireAuth = require("../middleware/requireAuth");

const aiRouter = express.Router();

aiRouter.post("/api/rag/chat", requireAuth, chatAIController);
aiRouter.get(
  "/api/chat/history/:session_id",
  requireAuth,
  getChatHistoryController,
);

module.exports = aiRouter;
