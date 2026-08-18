// server/src/services/ai/search.js
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check server/.env",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Thực hiện tìm kiếm Hybrid
 * @param {string} queryText - Câu hỏi của khách hàng
 * @param {number} alpha - Trọng số (0.5 mặc định)
 */
async function performHybridSearch(queryText, alpha = 0.5, matchCount = 5) {
  try {
    // 1. Sinh Embedding cho câu hỏi
    // Dùng model từ biến môi trường `EMBEDDING_MODEL` để dễ cấu hình.
    const embeddingModelName =
      process.env.EMBEDDING_MODEL || "models/gemini-embedding-001";
    console.log(`🔎 Using embedding model for search: ${embeddingModelName}`);
    const model = genAI.getGenerativeModel({ model: embeddingModelName });
    const result = await model.embedContent(queryText);
    const queryVector = result?.embedding?.values;

    // Validate embedding dimension
    const EXPECTED_DIM = Number(process.env.EMBEDDING_DIM) || 3072;
    if (!Array.isArray(queryVector) || queryVector.length !== EXPECTED_DIM) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EXPECTED_DIM}, got ${Array.isArray(queryVector) ? queryVector.length : typeof queryVector}`,
      );
    }

    // 2. Gọi hàm RPC match_products đã tạo trong Postgres
    const { data, error } = await supabase.rpc("match_products", {
      p_query_text: queryText,
      p_query_embedding: queryVector,
      p_alpha: alpha,
      p_match_count: Number.isFinite(matchCount)
        ? Math.max(1, Number(matchCount))
        : 5,
    });

    if (error) throw error;

    // Map RPC return `prod_id` or `product_id` to `id` for downstream consumers
    const mapped = (data || []).map((row) => {
      const out = { ...row };
      if (out.prod_id && !out.id) {
        out.id = out.prod_id;
        delete out.prod_id;
      }
      if (out.product_id && !out.id) {
        out.id = out.product_id;
        delete out.product_id;
      }
      return out;
    });

    return { results: mapped, queryVector }; // Trả về danh sách SP kèm điểm số (với `id` field) và embedding
  } catch (error) {
    console.error("Lỗi Hybrid Search:", error.message);
    throw error;
  }
}

module.exports = { performHybridSearch };
