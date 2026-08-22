const express = require("express");
const {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  retryProductEmbeddingController,
  deleteProductController,
} = require("../controllers/productController");
const requireAdmin = require("../middleware/requireAdmin");
const requireAuth = require("../middleware/requireAuth");
const {
  listProductReviewsController,
  createProductReviewController,
} = require("../controllers/reviewController");

const productRouter = express.Router();

productRouter.get("/api/products", listProductsController);
productRouter.get("/api/products/:id", getProductController);
productRouter.get("/api/products/:id/reviews", listProductReviewsController);
productRouter.post(
  "/api/products/:id/reviews",
  requireAuth,
  createProductReviewController,
);
productRouter.post("/api/products", requireAdmin, createProductController);
productRouter.put("/api/products/:id", requireAdmin, updateProductController);
productRouter.post(
  "/api/products/:id/retry-embedding",
  requireAdmin,
  retryProductEmbeddingController,
);
productRouter.delete(
  "/api/products/:id",
  requireAdmin,
  deleteProductController,
);

module.exports = productRouter;
