const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeCategory(category) {
  if (!category) return category;

  return {
    ...category,
    id: category.id,
    name: category.name,
    description: category.description || null,
    created_at: category.created_at,
    updated_at: category.updated_at,
  };
}

async function getCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, created_at")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data || []).map(normalizeCategory);
}

async function getCategoryById(categoryId) {
  if (!categoryId) {
    throw new Error("categoryId is required");
  }

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, created_at")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return normalizeCategory(data);
}

async function getCategoryWithProducts(categoryId) {
  const category = await getCategoryById(categoryId);
  if (!category) return null;

  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at, product_images(id, product_id, url, is_primary, sort_order)",
    )
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return {
    ...category,
    products: products || [],
  };
}

module.exports = {
  getCategories,
  getCategoryById,
  getCategoryWithProducts,
};
