const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check server/.env",
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function registerController(req, res) {
  try {
    const { email, password, full_name } = req.body || {};
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (
      !normalizedEmail ||
      normalizedEmail.length > 320 ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json(
        buildResponse(false, "Email and password are required", null, {
          code: "VALIDATION_ERROR",
        }),
      );
    }

    if (password.length < 6) {
      return res.status(400).json(
        buildResponse(false, "Password must be at least 6 characters", null, {
          code: "WEAK_PASSWORD",
        }),
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: full_name || "",
        },
      },
    });

    if (error) {
      const isRateLimit = /rate limit|too many.*email/i.test(
        error.message || "",
      );
      if (isRateLimit) {
        return res
          .status(429)
          .json(
            buildResponse(
              false,
              "Too many signup attempts for this email. Please wait a few minutes and try again.",
              null,
              { code: "EMAIL_RATE_LIMIT" },
            ),
          );
      }

      return res.status(400).json(
        buildResponse(false, "Registration failed", null, {
          code: "SIGNUP_FAILED",
        }),
      );
    }

    return res.status(201).json(
      buildResponse(
        true,
        "Registration successful. Please check your email to confirm account.",
        {
          user: data?.user || null,
          session: data?.session || null,
        },
      ),
    );
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json(
      buildResponse(false, "Registration service unavailable", null, {
        code: "INTERNAL_ERROR",
      }),
    );
  }
}

async function loginController(req, res) {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (
      !normalizedEmail ||
      normalizedEmail.length > 320 ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json(
        buildResponse(false, "Email and password are required", null, {
          code: "VALIDATION_ERROR",
        }),
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return res.status(401).json(
        buildResponse(false, "Invalid login credentials", null, {
          code: "AUTH_FAILED",
        }),
      );
    }

    return res.json(
      buildResponse(true, "Login successful", {
        user: data?.user || null,
        session: {
          access_token: data?.session?.access_token || null,
          refresh_token: data?.session?.refresh_token || null,
          expires_at: data?.session?.expires_at || null,
        },
      }),
    );
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json(
      buildResponse(false, "Login service unavailable", null, {
        code: "INTERNAL_ERROR",
      }),
    );
  }
}

async function refreshTokenController(req, res) {
  try {
    const refreshToken = String(req.body?.refresh_token || "").trim();
    if (!refreshToken) {
      return res.status(400).json(
        buildResponse(false, "Refresh token is required", null, {
          code: "REFRESH_TOKEN_REQUIRED",
        }),
      );
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return res.status(401).json(
        buildResponse(false, error?.message || "Invalid refresh token", null, {
          code: "REFRESH_TOKEN_INVALID",
        }),
      );
    }

    return res.json(
      buildResponse(true, "Token refreshed successfully", {
        user: data.user || null,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || null,
        },
      }),
    );
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json(
      buildResponse(false, "Authentication service unavailable", null, {
        code: "INTERNAL_ERROR",
      }),
    );
  }
}

async function updateProfileController(req, res) {
  try {
    const fullName = String(req.body?.full_name || "").trim();
    if (fullName.length > 120) {
      return res.status(400).json(
        buildResponse(false, "Full name must not exceed 120 characters", null, {
          code: "INVALID_PROFILE",
        }),
      );
    }

    if (!supabaseAdmin) throw new Error("Admin auth client is not configured");
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { user_metadata: { ...req.user.user_metadata, full_name: fullName } },
    );
    if (error) throw error;

    return res.json(
      buildResponse(true, "Profile updated successfully", {
        user: {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || null,
          role: data.user.app_metadata?.role || "customer",
        },
      }),
    );
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json(
      buildResponse(false, "Profile update failed", null, {
        code: "PROFILE_UPDATE_FAILED",
      }),
    );
  }
}

async function forgotPasswordController(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json(
        buildResponse(false, "Email is required", null, {
          code: "VALIDATION_ERROR",
        }),
      );
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
    });
    if (error) throw error;

    return res.json(
      buildResponse(true, "If the email exists, a reset link has been sent"),
    );
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json(
      buildResponse(false, "Password reset service unavailable", null, {
        code: "PASSWORD_RESET_FAILED",
      }),
    );
  }
}

async function changePasswordController(req, res) {
  try {
    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json(
        buildResponse(false, "Current and new passwords are required", null, {
          code: "VALIDATION_ERROR",
        }),
      );
    }
    if (newPassword.length < 6) {
      return res.status(400).json(
        buildResponse(
          false,
          "New password must be at least 6 characters",
          null,
          {
            code: "WEAK_PASSWORD",
          },
        ),
      );
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });
    if (verifyError) {
      return res.status(401).json(
        buildResponse(false, "Current password is invalid", null, {
          code: "CURRENT_PASSWORD_INVALID",
        }),
      );
    }

    if (!supabaseAdmin) throw new Error("Admin auth client is not configured");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: newPassword },
    );
    if (error) throw error;

    return res.json(buildResponse(true, "Password changed successfully"));
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json(
      buildResponse(false, "Password change failed", null, {
        code: "PASSWORD_CHANGE_FAILED",
      }),
    );
  }
}

async function meController(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json(
          buildResponse(false, "Unauthorized", null, { code: "UNAUTHORIZED" }),
        );
    }

    return res.json(
      buildResponse(true, "User info fetched", {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        role: user.app_metadata?.role || "customer",
      }),
    );
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "INTERNAL_ERROR",
      }),
    );
  }
}

module.exports = {
  registerController,
  loginController,
  refreshTokenController,
  updateProfileController,
  forgotPasswordController,
  changePasswordController,
  meController,
};
