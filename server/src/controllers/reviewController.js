const {
  getProductReviews,
  createProductReview,
} = require("../services/reviewService");

function buildResponse(success, message, data = null, error = null) {
  return { success, message, data, error };
}

async function listProductReviewsController(req, res) {
  try {
    const reviews = await getProductReviews(req.params.id);
    return res.json(
      buildResponse(true, "Product reviews retrieved", { reviews }),
    );
  } catch (err) {
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "REVIEWS_FETCH_FAILED",
      }),
    );
  }
}

async function createProductReviewController(req, res) {
  try {
    const review = await createProductReview(
      req.params.id,
      req.user.id,
      req.body || {},
    );
    return res
      .status(201)
      .json(buildResponse(true, "Product review created", { review }));
  } catch (err) {
    const notFound = err.message === "Product not found";
    const notPurchased = err.message?.includes("completed purchase");
    return res.status(notFound ? 404 : 400).json(
      buildResponse(
        false,
        notFound
          ? "Product not found"
          : notPurchased
            ? "A completed purchase is required"
            : "Review request is invalid",
        null,
        {
          code: notFound
            ? "PRODUCT_NOT_FOUND"
            : notPurchased
              ? "PURCHASE_REQUIRED"
              : "REVIEW_CREATE_FAILED",
        },
      ),
    );
  }
}

module.exports = {
  listProductReviewsController,
  createProductReviewController,
};
