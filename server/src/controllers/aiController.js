const { chatWithAI } = require("../services/ai/rag");

async function chatAIController(req, res) {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid `message` in body" });
    }

    const result = await chatWithAI(message);
    return res.json(result);
  } catch (err) {
    console.error("Error in /api/rag/chat:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

module.exports = { chatAIController };
