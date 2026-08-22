const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function getProductReviews(productId) {
  const { data, error } = await supabase
    .from("rated")
    .select("id, product_id, rating, comment, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function createProductReview(productId, userId, input = {}) {
  const rating = Number(input.rating);
  const comment = String(input.comment || "").trim() || null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }
  if (comment && comment.length > 2000) {
    throw new Error("Comment must not exceed 2,000 characters");
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) throw new Error("Product not found");

  const { data, error } = await supabase.rpc("create_verified_review", {
    p_product_id: productId,
    p_user_id: userId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error) throw error;
  if (!data) throw new Error("Review could not be created");
  return data;
}

module.exports = { getProductReviews, createProductReview };
