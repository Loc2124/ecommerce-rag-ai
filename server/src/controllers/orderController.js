const {
  createOrder,
  getOrders,
  getOrderById,
  validateOrderOwnership,
  cancelOrder,
} = require("../services/orderService");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function createOrderController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    const order = await createOrder(userId, req.body || {});
    return res
      .status(201)
      .json(buildResponse(true, "Order created successfully", { order }));
  } catch (err) {
    return res.status(400).json(
      buildResponse(false, err.message || "Bad request", null, {
        code: "ORDER_CREATE_FAILED",
      }),
    );
  }
}

async function listOrdersController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    const { page = 1, limit = 20 } = req.query;
    const orders = await getOrders(userId, { page, limit });

    return res.json(
      buildResponse(true, "Orders retrieved", {
        orders,
        page: Number(page),
        limit: Number(limit),
      }),
    );
  } catch (err) {
    console.error("Error in GET /api/orders:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "ORDERS_LIST_FAILED",
      }),
    );
  }
}

async function getOrderController(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    if (!orderId) {
      return res.status(400).json(
        buildResponse(false, "Order ID is required", null, {
          code: "INVALID_ORDER_ID",
        }),
      );
    }

    await validateOrderOwnership(orderId, userId);
    const order = await getOrderById(orderId);

    if (!order) {
      return res.status(404).json(
        buildResponse(false, "Order not found", null, {
          code: "ORDER_NOT_FOUND",
        }),
      );
    }

    return res.json(buildResponse(true, "Order retrieved", { order }));
  } catch (err) {
    if (err.message.includes("Forbidden")) {
      return res
        .status(403)
        .json(
          buildResponse(false, "Forbidden", null, { code: "ORDER_FORBIDDEN" }),
        );
    }

    console.error("Error in GET /api/orders/:orderId:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "ORDER_GET_FAILED",
      }),
    );
  }
}

async function cancelOrderController(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    if (!orderId) {
      return res.status(400).json(
        buildResponse(false, "Order ID is required", null, {
          code: "INVALID_ORDER_ID",
        }),
      );
    }

    const order = await cancelOrder(orderId, userId);

    return res.json(
      buildResponse(true, "Order cancelled successfully", { order }),
    );
  } catch (err) {
    if (err.message.includes("Forbidden")) {
      return res
        .status(403)
        .json(
          buildResponse(false, "Forbidden", null, { code: "ORDER_FORBIDDEN" }),
        );
    }

    if (err.message.includes("Cannot cancel")) {
      return res.status(400).json(
        buildResponse(false, err.message, null, {
          code: "INVALID_ORDER_STATUS",
        }),
      );
    }

    if (err.message.includes("Order not found")) {
      return res.status(404).json(
        buildResponse(false, "Order not found", null, {
          code: "ORDER_NOT_FOUND",
        }),
      );
    }

    console.error("Error in PUT /api/orders/:orderId/cancel:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "ORDER_CANCEL_FAILED",
      }),
    );
  }
}

module.exports = {
  createOrderController,
  listOrdersController,
  getOrderController,
  cancelOrderController,
};
