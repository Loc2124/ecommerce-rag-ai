const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { parsePagination } = require("../utils/pagination");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PRODUCT_COLUMNS =
  "id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at, embedding_status, embedding_error, embedding_updated_at, product_images(id, product_id, url, is_primary, sort_order)";
const PRODUCT_PUBLIC_COLUMNS =
  "id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at, product_images(id, product_id, url, is_primary, sort_order)";

async function updateEmbeddingStatus(productId, status, errorMessage = null) {
  try {
    const payload = {
      embedding_status: status,
      embedding_updated_at: new Date().toISOString(),
    };

    if (errorMessage) {
      payload.embedding_error = String(errorMessage).slice(0, 500);
    } else {
      payload.embedding_error = null;
    }

    await supabase.from("products").update(payload).eq("id", productId);
  } catch (error) {
    console.warn(
      "Warning: embedding status update skipped:",
      error?.message || error,
    );
  }
}

function normalizeProduct(product) {
  if (!product) return product;

  return {
    ...product,
    id: product.id,
    price: Number(product.price ?? 0),
    stock: Number(product.stock ?? 0),
  };
}

async function generateEmbedding(text, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelName =
    process.env.EMBEDDING_MODEL || "models/gemini-embedding-001";

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: modelName,
      });
      const result = await model.embedContent(text);
      const embedding = result?.embedding?.values || null;
      if (Array.isArray(embedding) && embedding.length > 0) {
        return embedding;
      }
      return null;
    } catch (error) {
      if (attempt === retries) {
        console.warn(
          "Warning: product embedding failed after retries:",
          error?.message || error,
        );
        return null;
      }

      const delayMs = 250 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

async function getProducts({ category_id, page = 1, limit = 20 } = {}) {
  const pagination = parsePagination(page, limit, 20);
  const safePage = pagination.page;
  const safeLimit = pagination.limit;
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from("products")
    .select(PRODUCT_PUBLIC_COLUMNS)
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
    .select(PRODUCT_PUBLIC_COLUMNS)
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

  if (
    !name ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 200
  ) {
    throw new Error("name and price are required");
  }

  const normalizedPrice = Number(price);
  const normalizedStock = Number(stock ?? 0);
  if (
    !Number.isFinite(normalizedPrice) ||
    normalizedPrice < 0 ||
    !Number.isInteger(normalizedStock) ||
    normalizedStock < 0
  ) {
    throw new Error(
      "price must be non-negative and stock must be a non-negative integer",
    );
  }

  const payload = {
    category_id: category_id || null,
    sku: sku || null,
    name: name.trim(),
    description: description || null,
    attributes: attributes || {},
    price: normalizedPrice,
    stock: normalizedStock,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("products")
    .insert([payload])
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) throw error;

  await updateEmbeddingStatus(data.id, "pending");

  try {
    const textToEmbed = [name, description || ""].filter(Boolean).join(" ");
    const embedding = await generateEmbedding(textToEmbed);
    if (embedding) {
      await supabase
        .from("products")
        .update({
          embedding,
          embedding_status: "ready",
          embedding_updated_at: new Date().toISOString(),
          embedding_error: null,
        })
        .eq("id", data.id);
    } else {
      await updateEmbeddingStatus(
        data.id,
        "failed",
        "embedding generation failed",
      );
    }
  } catch (embeddingError) {
    console.warn(
      "Warning: product embedding skipped:",
      embeddingError.message || embeddingError,
    );
    await updateEmbeddingStatus(
      data.id,
      "failed",
      embeddingError.message || "embedding generation skipped",
    );
  }

  return normalizeProduct(data);
}

async function updateProduct(productId, updates) {
  const existing = await getProductById(productId);
  if (!existing) {
    return null;
  }

  const allowedFields = [
    "category_id",
    "sku",
    "name",
    "description",
    "attributes",
    "price",
    "stock",
  ];
  const payload = Object.fromEntries(
    allowedFields
      .filter((field) => updates[field] !== undefined)
      .map((field) => [field, updates[field]]),
  );
  payload.updated_at = new Date().toISOString();

  if (updates.price !== undefined) {
    payload.price = Number(updates.price);
  }
  if (updates.stock !== undefined) {
    payload.stock = Number(updates.stock);
  }
  if (
    (payload.price !== undefined &&
      (!Number.isFinite(payload.price) || payload.price < 0)) ||
    (payload.stock !== undefined &&
      (!Number.isInteger(payload.stock) || payload.stock < 0))
  ) {
    throw new Error(
      "price must be non-negative and stock must be a non-negative integer",
    );
  }

  if (updates.name !== undefined || updates.description !== undefined) {
    await updateEmbeddingStatus(productId, "pending");

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
        payload.embedding_status = "ready";
        payload.embedding_error = null;
        payload.embedding_updated_at = new Date().toISOString();
      } else {
        payload.embedding_status = "failed";
        payload.embedding_error = "embedding generation failed";
      }
    } catch (embeddingError) {
      console.warn(
        "Warning: product embedding refresh skipped:",
        embeddingError.message || embeddingError,
      );
      payload.embedding_status = "failed";
      payload.embedding_error =
        embeddingError.message || "embedding generation skipped";
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) throw error;
  return normalizeProduct(data);
}

async function retryProductEmbedding(productId) {
  const existing = await getProductById(productId);
  if (!existing) return null;

  const textToEmbed = [existing.name, existing.description || ""]
    .filter(Boolean)
    .join(" ");
  await updateEmbeddingStatus(productId, "pending");

  const payload = {
    embedding_status: "failed",
    embedding_error: "embedding generation failed",
    embedding_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const embedding = await generateEmbedding(textToEmbed);
    if (!embedding) throw new Error("embedding generation failed");

    payload.embedding = embedding;
    payload.embedding_status = "ready";
    payload.embedding_error = null;
  } catch (error) {
    payload.embedding_error = String(error.message || error).slice(0, 500);
  }

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) throw error;
  return normalizeProduct(data);
}

async function deleteProduct(productId) {
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) throw error;
  return normalizeProduct(data);
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  retryProductEmbedding,
  deleteProduct,
};
