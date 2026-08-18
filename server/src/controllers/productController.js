const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../services/productService");

async function listProductsController(req, res) {
  try {
    const { category_id, page, limit } = req.query;
    const data = await getProducts({ category_id, page, limit });
    return res.json(data);
  } catch (err) {
    console.error("Error in GET /api/products:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

async function getProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await getProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(product);
  } catch (err) {
    console.error("Error in GET /api/products/:id:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

async function createProductController(req, res) {
  try {
    const product = await createProduct(req.body || {});
    return res.status(201).json(product);
  } catch (err) {
    console.error("Error in POST /api/products:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}

async function updateProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await updateProduct(id, req.body || {});
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(product);
  } catch (err) {
    console.error("Error in PUT /api/products/:id:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}

async function deleteProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await deleteProduct(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json({ deleted: true, product });
  } catch (err) {
    console.error("Error in DELETE /api/products/:id:", err);
    return res.status(400).json({ error: err.message || "Bad request" });
  }
}

module.exports = {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  deleteProductController,
};
