const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");
const crypto = require("crypto");

require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'"
  });
  res.end(JSON.stringify(payload));
}

// Register user
async function registerUser(req, res, bodyData) {
  try {
    const { name, email, password } = bodyData;
    if (!email || !password || !name) {
      return sendJson(res, 400, { ok: false, error: "Name, email, and password are required" });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return sendJson(res, 400, { ok: false, error: "Email already registered" });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // First user is automatically admin
    const list = await db.getUsersList();
    const role = list.length === 0 ? "admin" : "user";

    const user = await db.createUser({
      email,
      name,
      passwordHash,
      role
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
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
    sendJson(res, 500, { ok: false, error: "Server registration error: " + err.message });
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
    if (!user) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
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
    sendJson(res, 500, { ok: false, error: "Server login error: " + err.message });
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
  verifyToken,
  JWT_SECRET
};
