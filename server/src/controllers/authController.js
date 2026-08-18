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

async function emailAlreadyExists(email) {
  if (!supabaseAdmin || !supabaseAdmin.auth?.admin?.listUsers) {
    return false;
  }

  try {
    let page = 1;

    while (page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error) {
        console.error("Error listing auth users:", error);
        return false;
      }

      const users = data?.users || [];
      const found = users.some(
        (user) => (user.email || "").toLowerCase() === email,
      );

      if (found) {
        return true;
      }

      if (!users.length || users.length < 1000) {
        return false;
      }

      page += 1;
    }

    return false;
  } catch (err) {
    console.error("emailAlreadyExists failed:", err);
    return false;
  }
}

async function checkEmailController(req, res) {
  try {
    const email = String(req.query?.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json(
        buildResponse(false, "Email is required", null, {
          code: "VALIDATION_ERROR",
        }),
      );
    }

    const exists = await emailAlreadyExists(email);

    return res.json(
      buildResponse(
        true,
        exists ? "Email already registered" : "Email is available",
        {
          available: !exists,
        },
      ),
    );
  } catch (err) {
    console.error("Check email error:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "INTERNAL_ERROR",
      }),
    );
  }
}

async function registerController(req, res) {
  try {
    const { email, password, full_name } = req.body || {};
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !password) {
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

    const exists = await emailAlreadyExists(normalizedEmail);
    if (exists) {
      return res.status(409).json(
        buildResponse(false, "Email already registered", null, {
          code: "EMAIL_EXISTS",
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
        buildResponse(false, error.message || "Registration failed", null, {
          code: "SIGNUP_FAILED",
        }),
      );
    }

    return res.status(201).json(
      buildResponse(
        "Registration successful. Please check your email to confirm account.",
        true,
        {
          user: data?.user || null,
          session: data?.session || null,
        },
      ),
    );
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json(
      buildResponse(false, err.message || "Internal error", null, {
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

    if (!normalizedEmail || !password) {
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
        buildResponse(
          false,
          error.message || "Invalid login credentials",
          null,
          {
            code: "AUTH_FAILED",
          },
        ),
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
      buildResponse(false, err.message || "Internal error", null, {
        code: "INTERNAL_ERROR",
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
  checkEmailController,
  registerController,
  loginController,
  meController,
};
