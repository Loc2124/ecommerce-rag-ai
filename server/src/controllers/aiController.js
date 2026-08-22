const {
  chatWithAI,
  getChatHistoryBySession,
  enforceChatRateLimit,
} = require("../services/ai/rag");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function chatAIController(req, res) {
  try {
    const { message, session_id } = req.body || {};

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json(
        buildResponse(false, "Message is required", null, {
          code: "INVALID_MESSAGE",
        }),
      );
    }

    if (message.length > 2000) {
      return res.status(400).json(
        buildResponse(false, "Message must not exceed 2,000 characters", null, {
          code: "MESSAGE_TOO_LONG",
        }),
      );
    }

    const effectiveSessionId =
      session_id ||
      req.headers["x-session-id"] ||
      req.user?.id ||
      "guest-session";

    const quota = enforceChatRateLimit(req.user?.id);
    if (!quota.allowed) {
      return res.status(429).json(
        buildResponse(
          false,
          "Too many chat requests. Please slow down.",
          null,
          {
            code: "CHAT_RATE_LIMIT",
            retry_after_seconds: quota.retryAfterSeconds,
          },
        ),
      );
    }

    const result = await chatWithAI(message, {
      user_id: req.user?.id || null,
      session_id: effectiveSessionId,
    });

    return res.json(
      buildResponse(true, "Chat response generated", {
        answer: result.answer,
        recommendations: result.recommendations || [],
        is_fallback: Boolean(result.is_fallback),
        error_type: result.error_type || null,
        session_id: effectiveSessionId,
      }),
    );
  } catch (err) {
    console.error("Error in /api/rag/chat:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "CHAT_FAILED",
      }),
    );
  }
}

async function getChatHistoryController(req, res) {
  try {
    const { session_id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    const history = await getChatHistoryBySession(session_id, userId);

    return res.json(
      buildResponse(true, "Chat history retrieved", {
        session_id,
        items: history,
      }),
    );
  } catch (err) {
    console.error("Error in GET /api/chat/history/:session_id:", err);
    return res.status(403).json(
      buildResponse(false, "Forbidden or invalid session", null, {
        code: "SESSION_FORBIDDEN",
      }),
    );
  }
}

module.exports = { chatAIController, getChatHistoryController };
