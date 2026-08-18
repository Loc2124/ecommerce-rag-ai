// server/src/services/ai/rag.js
const { performHybridSearch } = require("./search");
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatQuotaStore = new Map();

function enforceChatRateLimit(userId, limitPerMinute = 10, windowMs = 60000) {
  if (!userId) {
    return { allowed: true, remaining: limitPerMinute };
  }

  const now = Date.now();
  const recent = (chatQuotaStore.get(userId) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (recent.length >= limitPerMinute) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000),
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  recent.push(now);
  chatQuotaStore.set(userId, recent);

  return {
    allowed: true,
    remaining: Math.max(0, limitPerMinute - recent.length),
  };
}

function extractAnswerText(response) {
  if (!response) return "";

  if (typeof response.text === "function") {
    return response.text();
  }

  return response.text || response.output_text || "";
}

async function detectLLMModel(apiKey, preferred) {
  // If user set LLM_MODEL explicitly, we'll check it first against the ModelService list
  if (preferred) {
    // we'll still validate against the list below
  }

  if (typeof fetch === "undefined") {
    console.warn(
      "⚠️ fetch not available, cannot auto-detect LLM model. Using preferred or fallback.",
    );
    return preferred || "models/text-bison-001";
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn(
        `⚠️ Model list request failed: ${res.status} ${res.statusText}`,
      );
      return preferred || "models/text-bison-001";
    }

    const body = await res.json();
    const models = body.models || [];

    // Normalize supported methods/features and find suitable model
    const supportsGenerate = (m) => {
      const methods = (
        m.supportedMethods ||
        m.supported_methods ||
        m.supported_features ||
        []
      ).map((s) => String(s).toLowerCase());
      if (methods.includes("generatecontent") || methods.includes("generate"))
        return true;
      // fallback: model name includes 'bison' or 'gemini' + 'chat' or 'flash' heuristics
      const n = (m.name || m.model || m.id || "").toLowerCase();
      return /bison|chat|gemini/.test(n);
    };

    // If preferred is in the list and supports generation, use it
    if (preferred) {
      const found = models.find(
        (m) =>
          m.name === preferred || m.model === preferred || m.id === preferred,
      );
      if (found && supportsGenerate(found)) return preferred;
    }

    const candidate = models.find(supportsGenerate);
    if (candidate) return candidate.name || candidate.model || candidate.id;
    return preferred || "models/text-bison-001";
  } catch (e) {
    console.warn("⚠️ Error while detecting LLM model:", e.message || e);
    return preferred || "models/text-bison-001";
  }
}

async function getChatHistoryBySession(sessionId, userId) {
  if (!sessionId) {
    throw new Error("Session id is required");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data, error } = await supabase
    .from("chat_logs")
    .select(
      "id, session_id, question, answer, used_rag, search_method, latency_ms, cache_hit, created_at",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function chatWithAI(userMessage, context = {}) {
  const { user_id = null, session_id = "guest-session" } = context;

  let products = [];
  let queryVector = null;
  let answer =
    "Xin lỗi, tôi không tìm thấy sản phẩm nào phù hợp với yêu cầu của bạn.";
  let isFallback = false;
  let errorType = null;

  try {
    const searchResult = await performHybridSearch(userMessage, 0.5);
    products = searchResult?.results || [];
    queryVector = searchResult?.queryVector || null;
  } catch (searchError) {
    console.error("Search failed in chatWithAI:", searchError);
    isFallback = true;
    errorType = "search_failed";
    products = [];
  }

  if (!products || products.length === 0) {
    isFallback = true;
    errorType = errorType || "no_product_match";
    answer =
      "Xin lỗi, tôi không tìm thấy sản phẩm nào phù hợp với yêu cầu của bạn.";
  } else {
    const contextString = products
      .map((p) => `- Tên: ${p.name}, Giá: ${p.price.toLocaleString()}đ`)
      .join("\n");

    const preferredLLM = process.env.LLM_MODEL;
    const llmModelName =
      (await detectLLMModel(process.env.GEMINI_API_KEY, preferredLLM)) ||
      preferredLLM ||
      "models/text-bison-001";

    console.log(`🔎 Using LLM model: ${llmModelName}`);
    const model = genAI.getGenerativeModel({ model: llmModelName });

    const prompt = `
      Bạn là trợ lý bán hàng thông minh. Dựa vào danh sách sản phẩm sau:
      ${contextString}

      Hãy trả lời câu hỏi của khách hàng: "${userMessage}"
      Yêu cầu:
      - Chỉ tư vấn dựa trên danh sách trên.
      - Trả lời ngắn gọn, nhiệt tình.
      - Nếu khách hỏi ngoài lề, hãy từ chối khéo léo.
    `;

    try {
      const chatResult = await model.generateContent(prompt);
      answer = extractAnswerText(chatResult.response || chatResult) || answer;
      isFallback = false;
      errorType = null;
    } catch (llmError) {
      console.error("LLM generation failed in chatWithAI:", llmError);
      isFallback = true;
      errorType = "llm_unavailable";
      answer = "Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.";
    }
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const start = Date.now();
    await supabase.from("chat_logs").insert({
      user_id: user_id,
      session_id: session_id,
      question: userMessage,
      question_embedding: queryVector,
      answer: answer,
      used_rag: true,
      search_method: "hybrid",
      token_count: null,
      latency_ms: Date.now() - start,
      cache_hit: false,
    });
  } catch (e) {
    console.warn("⚠️ Không thể lưu chat_log:", e.message || e);
  }

  return {
    answer,
    recommendations: products,
    is_fallback: isFallback,
    error_type: errorType,
  };
}

module.exports = {
  chatWithAI,
  getChatHistoryBySession,
  enforceChatRateLimit,
};
