const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");
const crypto = require("crypto");

require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");

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
  return sendJson(res, 400, { ok: false, error: "Direct registration is deprecated. Please register using Google Sign-In." });
}

// Login user
async function loginUser(req, res, bodyData) {
  return sendJson(res, 400, { ok: false, error: "Direct login is deprecated. Please sign in using Google Sign-In." });
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

