const {
  getCategories,
  getCategoryById,
  getCategoryWithProducts,
} = require("../services/categoryService");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function listCategoriesController(req, res) {
  try {
    const categories = await getCategories();

    return res.json(
      buildResponse(true, "Categories retrieved", { categories }),
    );
  } catch (err) {
    console.error("Error in GET /api/categories:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "CATEGORIES_LIST_FAILED",
      }),
    );
  }
}

async function getCategoryController(req, res) {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json(
        buildResponse(false, "Category ID is required", null, {
          code: "INVALID_CATEGORY_ID",
        }),
      );
    }

    const { withProducts } = req.query;

    let category;
    if (withProducts === "true") {
      category = await getCategoryWithProducts(categoryId);
    } else {
      category = await getCategoryById(categoryId);
    }

    if (!category) {
      return res.status(404).json(
        buildResponse(false, "Category not found", null, {
          code: "CATEGORY_NOT_FOUND",
        }),
      );
    }

    return res.json(buildResponse(true, "Category retrieved", { category }));
  } catch (err) {
    console.error("Error in GET /api/categories/:categoryId:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "CATEGORY_GET_FAILED",
      }),
    );
  }
}

module.exports = {
  listCategoriesController,
  getCategoryController,
};
