const {
  getAllOrders,
  updateOrderStatusAdmin,
  finalizeRefundAndCancelOrder,
  getAnalytics,
} = require("../services/adminService");
const { logAdminEvent, getAdminEvents } = require("../services/eventService");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

function isAdmin(user) {
  return user?.app_metadata?.role === "admin";
}

async function adminListOrdersController(req, res) {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json(
        buildResponse(false, "Forbidden: admin access required", null, {
          code: "ADMIN_FORBIDDEN",
        }),
      );
    }

    const { page = 1, limit = 50, status } = req.query;
    const result = await getAllOrders({ page, limit, status });

    return res.json(buildResponse(true, "Admin orders retrieved", result));
  } catch (err) {
    console.error("Error in GET /api/admin/orders:", err);
    return res.status(500).json(
      buildResponse(false, "Unable to retrieve admin orders", null, {
        code: "ADMIN_ORDERS_FAILED",
      }),
    );
  }
}

async function adminUpdateOrderStatusController(req, res) {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json(
        buildResponse(false, "Forbidden: admin access required", null, {
          code: "ADMIN_FORBIDDEN",
        }),
      );
    }

    const { orderId } = req.params;
    const { status } = req.body || {};

    if (!orderId) {
      return res.status(400).json(
        buildResponse(false, "Order ID is required", null, {
          code: "INVALID_ORDER_ID",
        }),
      );
    }

    if (!status) {
      return res.status(400).json(
        buildResponse(false, "Status is required", null, {
          code: "INVALID_STATUS",
        }),
      );
    }

    const updatedOrder = await updateOrderStatusAdmin(orderId, status);
    const { previous_status: previousStatus, ...order } = updatedOrder;

    await logAdminEvent(req.user.id, "update_order_status", "order", orderId, {
      from_status: previousStatus || null,
      to_status: status,
    });

    return res.json(buildResponse(true, "Order status updated", { order }));
  } catch (err) {
    if (err.message.includes("Order not found")) {
      return res.status(404).json(
        buildResponse(false, "Order not found", null, {
          code: "ORDER_NOT_FOUND",
        }),
      );
    }

    if (err.message.includes("Invalid status transition")) {
      return res.status(400).json(
        buildResponse(false, err.message, null, {
          code: "INVALID_STATUS_TRANSITION",
        }),
      );
    }

    if (err.message.includes("changed concurrently")) {
      return res.status(409).json(
        buildResponse(
          false,
          "Order status changed; please reload the order",
          null,
          {
            code: "ORDER_STATUS_CONFLICT",
          },
        ),
      );
    }

    if (err.message.includes("refund workflow")) {
      return res.status(409).json(
        buildResponse(false, "A refund is required before cancellation", null, {
          code: "REFUND_REQUIRED",
        }),
      );
    }

    console.error("Error in PUT /api/admin/orders/:orderId/status:", err);
    return res.status(500).json(
      buildResponse(false, "Unable to update order status", null, {
        code: "ADMIN_UPDATE_FAILED",
      }),
    );
  }
}

async function adminAnalyticsController(req, res) {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json(
        buildResponse(false, "Forbidden: admin access required", null, {
          code: "ADMIN_FORBIDDEN",
        }),
      );
    }

    const analytics = await getAnalytics();

    return res.json(buildResponse(true, "Analytics retrieved", analytics));
  } catch (err) {
    console.error("Error in GET /api/admin/analytics:", err);
    return res.status(500).json(
      buildResponse(false, "Unable to retrieve analytics", null, {
        code: "ADMIN_ANALYTICS_FAILED",
      }),
    );
  }
}

async function adminFinalizeRefundController(req, res) {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json(
        buildResponse(false, "Forbidden: admin access required", null, {
          code: "ADMIN_FORBIDDEN",
        }),
      );
    }

    const { refund_transaction_id, note } = req.body || {};
    if (
      typeof refund_transaction_id !== "string" ||
      !refund_transaction_id.trim()
    ) {
      return res.status(400).json(
        buildResponse(false, "Refund transaction ID is required", null, {
          code: "REFUND_TRANSACTION_REQUIRED",
        }),
      );
    }

    const order = await finalizeRefundAndCancelOrder(
      req.params.orderId,
      req.user.id,
      refund_transaction_id,
      typeof note === "string" ? note.slice(0, 1000) : null,
    );

    return res.json(
      buildResponse(true, "Refund recorded and order cancelled", { order }),
    );
  } catch (err) {
    console.error("Error finalizing refund:", err);
    const message = err.message || "Unable to finalize refund";
    const notFound = message.includes("order_not_found");
    return res.status(notFound ? 404 : 409).json(
      buildResponse(
        false,
        notFound ? "Order not found" : "Refund cannot be finalized",
        null,
        {
          code: notFound ? "ORDER_NOT_FOUND" : "REFUND_FINALIZE_FAILED",
        },
      ),
    );
  }
}

async function adminEventsController(req, res) {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json(
        buildResponse(false, "Forbidden: admin access required", null, {
          code: "ADMIN_FORBIDDEN",
        }),
      );
    }

    const { page = 1, limit = 100 } = req.query;
    const result = await getAdminEvents({ page, limit });

    return res.json(buildResponse(true, "Admin events retrieved", result));
  } catch (err) {
    console.error("Error in GET /api/admin/events:", err);
    return res.status(500).json(
      buildResponse(false, "Unable to retrieve admin events", null, {
        code: "ADMIN_EVENTS_FAILED",
      }),
    );
  }
}

module.exports = {
  adminListOrdersController,
  adminUpdateOrderStatusController,
  adminFinalizeRefundController,
  adminAnalyticsController,
  adminEventsController,
};
