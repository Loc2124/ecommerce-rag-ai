const express = require("express");
const {
  listCategoriesController,
  getCategoryController,
} = require("../controllers/categoryController");

const categoryRouter = express.Router();

categoryRouter.get("/api/categories", listCategoriesController);
categoryRouter.get("/api/categories/:categoryId", getCategoryController);

module.exports = categoryRouter;
