const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

// Kiểm tra biến môi trường
if (!process.env.SUPABASE_URL || !process.env.GEMINI_API_KEY) {
  console.error(
    "❌ Lỗi: Thiếu SUPABASE_URL hoặc GEMINI_API_KEY trong file .env",
  );
  process.exit(1);
}

// 1. Khởi tạo kết nối
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * EMBEDDING MODEL
 * - Prefer cấu hình qua biến môi trường `EMBEDDING_MODEL`.
 * - Mặc định fallback sang `models/textembedding-gecko-001` (thay đổi tuỳ provider).
 * Nếu vẫn thấy 404, gọi ModelService.ListModels hoặc set `EMBEDDING_MODEL` theo danh sách model.
 */
// Try to detect a supported embedding model via ModelService.ListModels (v1)
async function detectEmbeddingModel(apiKey) {
  // If user provided EMBEDDING_MODEL explicitly, respect it
  if (process.env.EMBEDDING_MODEL) return process.env.EMBEDDING_MODEL;

  // If fetch isn't available (older Node), skip detection
  if (typeof fetch === "undefined") {
    console.warn("⚠️ fetch not available, skipping model auto-detection.");
    return "models/textembedding-gecko-001";
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn(
        `⚠️ Model list request failed: ${res.status} ${res.statusText}`,
      );
      return "models/textembedding-gecko-001";
    }

    const body = await res.json();
    const models = body.models || [];

    // Prefer models that explicitly mention embedding support
    for (const m of models) {
      const name = m.name || m.model || m.id || "";
      const supported = (m.supportedMethods || m.supported_features || []).map(
        (s) => String(s).toLowerCase(),
      );
      if (
        supported.includes("embedcontent") ||
        supported.includes("embedding") ||
        /embed/.test(name.toLowerCase()) ||
        /embedding/.test(name.toLowerCase())
      ) {
        return name;
      }
    }

    // Fallback
    return "models/textembedding-gecko-001";
  } catch (e) {
    console.warn("⚠️ Lỗi khi gọi ModelService.ListModels:", e.message || e);
    return "models/textembedding-gecko-001";
  }
}

// embeddingModel will be created inside `seed()` so we avoid top-level await

async function seed() {
  try {
    const rawData = fs.readFileSync(
      "./scripts/products_cellphones.json",
      "utf8",
    );
    const products = JSON.parse(rawData);
    console.log(`📦 Đã đọc ${products.length} sản phẩm từ file JSON.`);

    // --- BƯỚC 1: XỬ LÝ DANH MỤC ---
    const uniqueCategoryNames = [...new Set(products.map((p) => p.category))];
    const categoryMap = {};

    console.log("📁 Đang xử lý danh mục sản phẩm...");
    for (const catName of uniqueCategoryNames) {
      // Kiểm tra danh mục đã tồn tại chưa
      let { data: existingCat, error: selectError } = await supabase
        .from("categories")
        .select("id")
        .eq("name", catName)
        .maybeSingle(); // Sử dụng maybeSingle để không báo lỗi nếu không tìm thấy

      if (existingCat) {
        categoryMap[catName] = existingCat.id;
        console.log(`ℹ️ Danh mục đã có: ${catName}`);
      } else {
        const { data: newCat, error: insertError } = await supabase
          .from("categories")
          .insert({
            name: catName,
            slug: catName.toLowerCase().trim().replace(/\s+/g, "-"),
          })
          .select();

        if (insertError) {
          console.error(`❌ Lỗi tạo danh mục ${catName}:`, insertError.message);
        } else {
          categoryMap[catName] = newCat[0].id;
          console.log(`✅ Đã tạo mới danh mục: ${catName}`);
        }
      }
    }

    // --- BƯỚC 2: SINH VECTOR VÀ NẠP SẢN PHẨM ---
    console.log(
      "\n🤖 Đang gọi Gemini sinh Vector (Embedding) và nạp vào Database...",
    );

    // Chọn model embedding (tự động phát hiện nếu có thể)
    const embeddingModelName = await detectEmbeddingModel(
      process.env.GEMINI_API_KEY,
    );
    console.log(`🔎 Using embedding model: ${embeddingModelName}`);
    const embeddingModel = genAI.getGenerativeModel({
      model: embeddingModelName,
    });

    for (let i = 0; i < products.length; i++) {
      const p = products[i];

      // Nội dung văn bản để sinh vector
      const textToEmbed = `Sản phẩm: ${p.name}. Thương hiệu: ${p.manufacturer}. Thông số: ${p.specs}. Mô tả: ${p.description}`;

      try {
        // Kiểm tra xem sản phẩm đã có trong DB chưa (dựa vào SKU) để tránh nạp trùng
        const { data: existingProduct } = await supabase
          .from("products")
          .select("id")
          .eq("sku", p.sku)
          .maybeSingle();

        if (existingProduct) {
          console.log(`⏭️ Bỏ qua (SKU đã tồn tại): ${p.name}`);
          continue;
        }

        // Gọi API Gemini sinh vector
        const result = await embeddingModel.embedContent(textToEmbed);
        const embedding = result.embedding.values;

        // Nạp sản phẩm vào bảng products
        const { error: insertError } = await supabase.from("products").insert({
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock || 50,
          category_id: categoryMap[p.category],
          embedding: embedding,
          attributes: {
            manufacturer: p.manufacturer,
            specs: p.specs,
            thumbnail: p.thumbnail,
            url: p.url,
          },
        });

        if (insertError) {
          console.error(`❌ Lỗi tại SP ${p.name}:`, insertError.message);
        } else {
          console.log(`✅ [${i + 1}/${products.length}] Thành công: ${p.name}`);
        }

        // Nghỉ 500ms (0.5 giây) giữa mỗi lần gọi để an toàn cho gói API Free
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`🔥 Lỗi xử lý tại SP ${p.name}:`, err.message);
        // Nếu gặp lỗi 429 (Too many requests), hãy tạm dừng lâu hơn
        if (err.message.includes("429")) {
          console.log("⏳ Đang bị giới hạn tốc độ, nghỉ 5 giây...");
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    console.log("\n✨ HOÀN THÀNH! Dữ liệu đã sẵn sàng cho Hybrid Search.");
  } catch (error) {
    console.error("💥 Lỗi hệ thống:", error.message);
  }
}

seed();
