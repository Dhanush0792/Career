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
async function registerUser(req, res, bodyData, { recordLoginFailure, isAccountLocked, clearLoginFailures } = {}) {
  try {
    const { name, email, password } = bodyData;
    if (!email || !password || !name) {
      return sendJson(res, 400, { ok: false, error: "Name, email, and password are required" });
    }
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return sendJson(res, 400, { ok: false, error: "Name must be between 2 and 100 characters" });
    }
    if (!validateEmail(email)) {
      return sendJson(res, 400, { ok: false, error: "Invalid email address format" });
    }
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return sendJson(res, 400, { ok: false, error: pwCheck.reason });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return sendJson(res, 400, { ok: false, error: "Email already registered" });
    }

    const salt = bcrypt.genSaltSync(12); // Upgraded from 10 to 12 rounds
    const passwordHash = bcrypt.hashSync(password, salt);

    // First user is automatically admin
    const list = await db.getUsersList();
    const role = list.length === 0 ? "admin" : "user";

    const user = await db.createUser({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      role
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" } // Shortened from 7d to 24h
    );

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
    console.error("Registration error:", err);
    sendJson(res, 500, { ok: false, error: "Registration failed. Please try again." });
  }
}

// Login user
async function loginUser(req, res, bodyData, { recordLoginFailure, isAccountLocked, clearLoginFailures } = {}) {
  try {
    const { email, password } = bodyData;
    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: "Email and password are required" });
    }
    if (!validateEmail(email)) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }

    // Check account lockout
    if (isAccountLocked && isAccountLocked(email)) {
      return sendJson(res, 429, { ok: false, error: "Account temporarily locked due to repeated failed attempts. Please wait 15 minutes." });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      if (recordLoginFailure) recordLoginFailure(email);
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      if (recordLoginFailure) recordLoginFailure(email);
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }

    // Success: clear failure counter
    if (clearLoginFailures) clearLoginFailures(email);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

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
    sendJson(res, 500, { ok: false, error: "Login failed. Please try again." });
  }
}

// Update user account details
async function updateUserAccount(req, res, bodyData, activeUser) {
  try {
    const { name, email, currentPassword, newPassword } = bodyData;
    if (!activeUser) {
      return sendJson(res, 401, { ok: false, error: "Authentication required" });
    }

    const user = await db.getUserById(activeUser.id);
    if (!user) {
      return sendJson(res, 404, { ok: false, error: "User not found" });
    }

    // Verify current password
    if (currentPassword || newPassword || email) {
      if (!currentPassword) {
        return sendJson(res, 400, { ok: false, error: "Current password is required to update email or password" });
      }
      const valid = bcrypt.compareSync(currentPassword, user.passwordHash);
      if (!valid) {
        return sendJson(res, 401, { ok: false, error: "Invalid current password" });
      }
    }

    let updatedPasswordHash = user.passwordHash;
    if (newPassword) {
      const pwCheck = validatePassword(newPassword);
      if (!pwCheck.ok) {
        return sendJson(res, 400, { ok: false, error: pwCheck.reason });
      }
      const salt = bcrypt.genSaltSync(12);
      updatedPasswordHash = bcrypt.hashSync(newPassword, salt);
    }

    let updatedEmail = user.email;
    if (email && email.toLowerCase().trim() !== user.email) {
      const newEmailNormalized = email.toLowerCase().trim();
      if (!validateEmail(newEmailNormalized)) {
        return sendJson(res, 400, { ok: false, error: "Invalid email format" });
      }
      const existing = await db.getUserByEmail(newEmailNormalized);
      if (existing) {
        return sendJson(res, 400, { ok: false, error: "Email already in use" });
      }
      updatedEmail = newEmailNormalized;
    }

    let updatedName = user.name;
    if (name && name.trim() !== user.name) {
      if (name.trim().length < 2 || name.trim().length > 100) {
        return sendJson(res, 400, { ok: false, error: "Name must be between 2 and 100 characters" });
      }
      updatedName = name.trim();
    }

    await db.updateUserCredentials(activeUser.id, {
      email: updatedEmail,
      name: updatedName,
      passwordHash: updatedPasswordHash
    });

    const token = jwt.sign(
      { userId: user.id, email: updatedEmail, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    sendJson(res, 200, {
      ok: true,
      token,
      user: {
        id: user.id,
        email: updatedEmail,
        name: updatedName,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Update account error:", err);
    sendJson(res, 500, { ok: false, error: "Account update failed" });
  }
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
  verifyToken,
  JWT_SECRET
};

