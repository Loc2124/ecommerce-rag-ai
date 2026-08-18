const express = require("express");
const {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  deleteProductController,
} = require("../controllers/productController");
const requireAuth = require("../middleware/requireAuth");

const productRouter = express.Router();

productRouter.get("/api/products", listProductsController);
productRouter.get("/api/products/:id", getProductController);
productRouter.post("/api/products", requireAuth, createProductController);
productRouter.put("/api/products/:id", requireAuth, updateProductController);
productRouter.delete("/api/products/:id", requireAuth, deleteProductController);

module.exports = productRouter;
