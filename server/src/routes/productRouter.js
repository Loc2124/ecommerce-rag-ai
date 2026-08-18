const express = require("express");
const {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  deleteProductController,
} = require("../controllers/productController");
const requireAdmin = require("../middleware/requireAdmin");

const productRouter = express.Router();

productRouter.get("/api/products", listProductsController);
productRouter.get("/api/products/:id", getProductController);
productRouter.post("/api/products", requireAdmin, createProductController);
productRouter.put("/api/products/:id", requireAdmin, updateProductController);
productRouter.delete(
  "/api/products/:id",
  requireAdmin,
  deleteProductController,
);

module.exports = productRouter;
