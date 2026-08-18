const requireAuth = require("./requireAuth");

function isAdmin(user) {
  return user?.app_metadata?.role === "admin";
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: admin access required",
        data: null,
        error: { code: "ADMIN_FORBIDDEN" },
      });
    }

    return next();
  });
}

module.exports = requireAdmin;
