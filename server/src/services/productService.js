const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeProduct(product) {
  if (!product) return product;

  return {
    ...product,
    id: product.id,
    price: Number(product.price ?? 0),
    stock: Number(product.stock ?? 0),
  };
}

async function generateEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelName =
    process.env.EMBEDDING_MODEL || "models/gemini-embedding-001";
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName,
  });
  const result = await model.embedContent(text);
  return result?.embedding?.values || null;
}

async function getProducts({ category_id, page = 1, limit = 20 } = {}) {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from("products")
    .select("*, product_images(*)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category_id) {
    query = query.eq("category_id", category_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(normalizeProduct);
}

async function getProductById(productId) {
  const { data, error } = await supabase
    .from("products")
    .select("*, product_images(*)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return normalizeProduct(data);
}

async function createProduct(productInput) {
  const { category_id, sku, name, description, attributes, price, stock } =
    productInput;

  if (!name || !price) {
    throw new Error("name and price are required");
  }

  const payload = {
    category_id: category_id || null,
    sku: sku || null,
    name,
    description: description || null,
    attributes: attributes || {},
    price: Number(price),
    stock: Number(stock ?? 0),
    is_active: true,
  };

  const { data, error } = await supabase
    .from("products")
    .insert([payload])
    .select("*, product_images(*)")
    .single();

  if (error) throw error;

  try {
    const textToEmbed = [name, description || ""].filter(Boolean).join(" ");
    const embedding = await generateEmbedding(textToEmbed);
    if (embedding) {
      await supabase.from("products").update({ embedding }).eq("id", data.id);
    }
  } catch (embeddingError) {
    console.warn(
      "Warning: product embedding skipped:",
      embeddingError.message || embeddingError,
    );
  }

  return normalizeProduct(data);
}

async function updateProduct(productId, updates) {
  const existing = await getProductById(productId);
  if (!existing) {
    return null;
  }

  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.price !== undefined) {
    payload.price = Number(updates.price);
  }
  if (updates.stock !== undefined) {
    payload.stock = Number(updates.stock);
  }

  if (updates.name !== undefined || updates.description !== undefined) {
    try {
      const textToEmbed = [
        updates.name || existing.name,
        updates.description || existing.description || "",
      ]
        .filter(Boolean)
        .join(" ");
      const embedding = await generateEmbedding(textToEmbed);
      if (embedding) {
        payload.embedding = embedding;
      }
    } catch (embeddingError) {
      console.warn(
        "Warning: product embedding refresh skipped:",
        embeddingError.message || embeddingError,
      );
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select("*, product_images(*)")
    .single();

  if (error) throw error;
  return normalizeProduct(data);
}

async function deleteProduct(productId) {
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .select("*, product_images(*)")
    .single();

  if (error) throw error;
  return normalizeProduct(data);
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
