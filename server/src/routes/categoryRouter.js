const express = require("express");
const {
  listCategoriesController,
  getCategoryController,
  createCategoryController,
  updateCategoryController,
  deleteCategoryController,
} = require("../controllers/categoryController");
const requireAdmin = require("../middleware/requireAdmin");

const categoryRouter = express.Router();

categoryRouter.get("/api/categories", listCategoriesController);
categoryRouter.get("/api/categories/:categoryId", getCategoryController);
categoryRouter.post("/api/categories", requireAdmin, createCategoryController);
categoryRouter.put(
  "/api/categories/:categoryId",
  requireAdmin,
  updateCategoryController,
);
categoryRouter.delete(
  "/api/categories/:categoryId",
  requireAdmin,
  deleteCategoryController,
);

module.exports = categoryRouter;
