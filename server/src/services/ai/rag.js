// server/src/services/ai/rag.js
const { performHybridSearch } = require("./search");
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

async function chatWithAI(userMessage) {
  // 1. Lấy context từ Hybrid Search (cùng trả về embedding của câu hỏi)
  const { results: products, queryVector } = await performHybridSearch(
    userMessage,
    0.5,
  );

  if (!products || products.length === 0) {
    return "Xin lỗi, tôi không tìm thấy sản phẩm nào phù hợp với yêu cầu của bạn.";
  }

  // 2. Định dạng context để đưa vào Prompt
  const contextString = products
    .map((p) => `- Tên: ${p.name}, Giá: ${p.price.toLocaleString()}đ`)
    .join("\n");

  // 3. Gọi LLM để sinh câu trả lời — detect a supported model if configured one is invalid
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

  const chatResult = await model.generateContent(prompt);
  const answer =
    typeof chatResult.response?.text === "function"
      ? chatResult.response.text()
      : chatResult.response?.text || "";

  // 4. Lưu chat log vào bảng `chat_logs` (không block trả về nếu lỗi)
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const start = Date.now();
    await supabase.from("chat_logs").insert({
      user_id: null,
      session_id: null,
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
    recommendations: products, // Trả về để frontend hiển thị card sản phẩm
  };
}

module.exports = { chatWithAI };
