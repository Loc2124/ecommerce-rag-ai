const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  retryProductEmbedding,
  deleteProduct,
} = require("../services/productService");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function listProductsController(req, res) {
  try {
    const { category_id, page, limit } = req.query;
    const data = await getProducts({ category_id, page, limit });
    return res.json(buildResponse(true, "Products retrieved", data));
  } catch (err) {
    console.error("Error in GET /api/products:", err);
    return res.status(500).json(
      buildResponse(false, "Product service unavailable", null, {
        code: "PRODUCT_FETCH_FAILED",
      }),
    );
  }
}

async function getProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await getProductById(id);
    if (!product) {
      return res.status(404).json(
        buildResponse(false, "Product not found", null, {
          code: "PRODUCT_NOT_FOUND",
        }),
      );
    }
    return res.json(buildResponse(true, "Product retrieved", product));
  } catch (err) {
    console.error("Error in GET /api/products/:id:", err);
    return res.status(500).json(
      buildResponse(false, "Product service unavailable", null, {
        code: "PRODUCT_FETCH_FAILED",
      }),
    );
  }
}

async function createProductController(req, res) {
  try {
    const product = await createProduct(req.body || {});
    return res
      .status(201)
      .json(buildResponse(true, "Product created successfully", product));
  } catch (err) {
    console.error("Error in POST /api/products:", err);
    return res.status(400).json(
      buildResponse(false, "Product request is invalid", null, {
        code: "PRODUCT_CREATE_FAILED",
      }),
    );
  }
}

async function updateProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await updateProduct(id, req.body || {});
    if (!product) {
      return res.status(404).json(
        buildResponse(false, "Product not found", null, {
          code: "PRODUCT_NOT_FOUND",
        }),
      );
    }
    return res.json(
      buildResponse(true, "Product updated successfully", product),
    );
  } catch (err) {
    console.error("Error in PUT /api/products/:id:", err);
    return res.status(400).json(
      buildResponse(false, "Product request is invalid", null, {
        code: "PRODUCT_UPDATE_FAILED",
      }),
    );
  }
}

async function deleteProductController(req, res) {
  try {
    const { id } = req.params;
    const product = await deleteProduct(id);
    if (!product) {
      return res.status(404).json(
        buildResponse(false, "Product not found", null, {
          code: "PRODUCT_NOT_FOUND",
        }),
      );
    }
    return res.json(
      buildResponse(true, "Product deleted successfully", {
        deleted: true,
        product,
      }),
    );
  } catch (err) {
    console.error("Error in DELETE /api/products/:id:", err);
    return res.status(400).json(
      buildResponse(false, "Product request is invalid", null, {
        code: "PRODUCT_DELETE_FAILED",
      }),
    );
  }
}

async function retryProductEmbeddingController(req, res) {
  try {
    const product = await retryProductEmbedding(req.params.id);
    if (!product) {
      return res.status(404).json(
        buildResponse(false, "Product not found", null, {
          code: "PRODUCT_NOT_FOUND",
        }),
      );
    }

    return res.json(
      buildResponse(true, "Product embedding retry completed", product),
    );
  } catch (err) {
    console.error("Error in POST /api/products/:id/retry-embedding:", err);
    return res.status(500).json(
      buildResponse(false, "Embedding retry failed", null, {
        code: "EMBEDDING_RETRY_FAILED",
      }),
    );
  }
}

module.exports = {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  retryProductEmbeddingController,
  deleteProductController,
};
