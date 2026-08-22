const express = require("express");
const {
  adminListOrdersController,
  adminUpdateOrderStatusController,
  adminFinalizeRefundController,
  adminAnalyticsController,
  adminEventsController,
} = require("../controllers/adminController");
const requireAdmin = require("../middleware/requireAdmin");

const adminRouter = express.Router();

adminRouter.get("/api/admin/orders", requireAdmin, adminListOrdersController);
adminRouter.put(
  "/api/admin/orders/:orderId/status",
  requireAdmin,
  adminUpdateOrderStatusController,
);
adminRouter.post(
  "/api/admin/orders/:orderId/refund/finalize",
  requireAdmin,
  adminFinalizeRefundController,
);
adminRouter.get("/api/admin/analytics", requireAdmin, adminAnalyticsController);
adminRouter.get("/api/admin/events", requireAdmin, adminEventsController);

module.exports = adminRouter;
