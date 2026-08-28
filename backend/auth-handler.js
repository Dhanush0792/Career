const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");
const crypto = require("crypto");

require("dotenv").config();
const _jwtSecretFromEnv = process.env.JWT_SECRET;
if (!_jwtSecretFromEnv) {
  console.warn(
    "[AUTH] WARNING: JWT_SECRET environment variable is not set. " +
    "A random secret has been generated for this session. " +
    "All existing user sessions will be INVALIDATED on every server restart. " +
    "Set JWT_SECRET in your .env file or environment for persistent sessions."
  );
}
const JWT_SECRET = _jwtSecretFromEnv || require("crypto").randomBytes(64).toString("hex");

// ── Validators ─────────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function validateEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim()) && email.length <= 255;
}

function validatePassword(password) {
  if (typeof password !== "string") return { ok: false, reason: "Password must be a string" };
  if (password.length < 8) return { ok: false, reason: "Password must be at least 8 characters" };
  if (password.length > 128) return { ok: false, reason: "Password must be at most 128 characters" };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: "Password must contain at least one uppercase letter" };
  if (!/[0-9]/.test(password)) return { ok: false, reason: "Password must contain at least one digit" };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, reason: "Password must contain at least one special character (!@#$%^&* etc.)" };
  return { ok: true };
}

function sendJson(res, code, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.statusCode = code;
  res.end(JSON.stringify(payload));
}

// Register user
async function registerUser(req, res, bodyData) {
  try {
    const { email, password, name } = bodyData;
    
    if (!validateEmail(email)) {
      return sendJson(res, 400, { ok: false, error: "Invalid email format" });
    }
    
    const pwVal = validatePassword(password);
    if (!pwVal.ok) {
      return sendJson(res, 400, { ok: false, error: pwVal.reason });
    }
    
    // Check if user already exists
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return sendJson(res, 400, { ok: false, error: "User with this email already exists" });
    }
    
    // Hash password and create user
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await db.createUser({ email, name: name || "", passwordHash });
    
    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    
    sendJson(res, 201, {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Register error:", err);
    sendJson(res, 500, { ok: false, error: "Registration failed: " + err.message });
  }
}

// Login user
async function loginUser(req, res, bodyData) {
  try {
    const { email, password } = bodyData;
    
    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: "Email and password are required" });
    }
    
    const user = await db.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }
    
    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    
    sendJson(res, 200, {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    sendJson(res, 500, { ok: false, error: "Login failed: " + err.message });
  }
}

// Update user account details
async function updateUserAccount(req, res, bodyData, activeUser) {
  try {
    const { name } = bodyData;
    if (!activeUser) {
      return sendJson(res, 401, { ok: false, error: "Authentication required" });
    }

    const user = await db.getUserById(activeUser.id);
    if (!user) {
      return sendJson(res, 404, { ok: false, error: "User not found" });
    }

    let updatedName = user.name;
    if (name && name.trim() !== user.name) {
      if (name.trim().length < 2 || name.trim().length > 100) {
        return sendJson(res, 400, { ok: false, error: "Name must be between 2 and 100 characters" });
      }
      updatedName = name.trim();
    }

    await db.updateUserCredentials(activeUser.id, {
      email: user.email,
      name: updatedName,
      passwordHash: user.passwordHash
    });

    sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: updatedName,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Update account error:", err);
    sendJson(res, 500, { ok: false, error: "Account update failed" });
  }
}

// Forgot password token generation
async function forgotPassword(req, res, bodyData) {
  return sendJson(res, 400, { ok: false, error: "Password recovery is deprecated. Please sign in using Google Sign-In." });
}

// Reset password execution
async function resetPassword(req, res, bodyData) {
  return sendJson(res, 400, { ok: false, error: "Password reset is deprecated. Please sign in using Google Sign-In." });
}

// Middleware helper
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = {
  registerUser,
  loginUser,
  updateUserAccount,
  forgotPassword,
  resetPassword,
  verifyToken,
  JWT_SECRET
};

