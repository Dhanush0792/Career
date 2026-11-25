const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const USERS_DIR = path.join(__dirname, "..", "database", "users");
const REPORTS_FILE = path.join(__dirname, "..", "database", "map-reports.json");
const USER_INDEX_FILE = path.join(__dirname, "..", "database", "user-registry.json");
const TELEMETRY_FILE = path.join(__dirname, "..", "database", "telemetry.json");

// Ensure directories exist
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

// Supabase PostgreSQL Pool Initialization
let usePg = false;
let pgInitialized = false;
let pgInitError = null;
let pool = null;

async function initializeDatabase(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      password_hash VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      tier VARCHAR(50) DEFAULT 'free',
      created_at BIGINT,
      last_sync BIGINT,
      passcode_hash VARCHAR(255)
    )
  `);

  await p.query(`
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  `);

  await p.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255);
  `);
  await p.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry BIGINT;
  `);
  await p.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS userdata (
      user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile TEXT,
      applications TEXT
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(255) PRIMARY KEY,
      portal VARCHAR(255),
      field VARCHAR(255),
      selector_tried TEXT,
      reporter_email VARCHAR(255),
      submitted_at BIGINT,
      status VARCHAR(50) DEFAULT 'pending'
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS telemetry (
      metric_key VARCHAR(255) PRIMARY KEY,
      metric_value INT DEFAULT 0
    )
  `);

  // ── Durable Payment, Webhook, Entitlement & Refund Tables ──
  await p.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      internal_order_id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      razorpay_order_id VARCHAR(128) NOT NULL,
      plan_id VARCHAR(64) NOT NULL,
      expected_amount INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      duration_days INT NOT NULL,
      environment VARCHAR(16) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'created',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE (environment, razorpay_order_id)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS payments (
      internal_payment_id VARCHAR(128) PRIMARY KEY,
      internal_order_id VARCHAR(128) REFERENCES payment_orders(internal_order_id) ON DELETE SET NULL,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      razorpay_order_id VARCHAR(128) NOT NULL,
      razorpay_payment_id VARCHAR(128) NOT NULL,
      amount INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      payment_status VARCHAR(32) NOT NULL,
      capture_status VARCHAR(32) NOT NULL,
      method VARCHAR(64),
      environment VARCHAR(16) NOT NULL,
      verified_at BIGINT,
      entitlement_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE (environment, razorpay_payment_id)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (environment, razorpay_order_id)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id VARCHAR(128) PRIMARY KEY,
      event_id VARCHAR(128) NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      environment VARCHAR(16) NOT NULL,
      processing_status VARCHAR(32) NOT NULL DEFAULT 'received',
      attempts INT NOT NULL DEFAULT 1,
      received_at BIGINT NOT NULL,
      processed_at BIGINT,
      error_message TEXT,
      UNIQUE (environment, event_id)
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS subscription_entitlements (
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id VARCHAR(64) NOT NULL DEFAULT 'free',
      status VARCHAR(32) NOT NULL DEFAULT 'inactive',
      started_at BIGINT,
      expires_at BIGINT,
      source_payment_id VARCHAR(128),
      environment VARCHAR(16) NOT NULL DEFAULT 'live',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, environment)
    )
  `);

  // Safe non-destructive migration: upgrade legacy single-column PK (user_id) -> composite PK (user_id, environment)
  try {
    await p.query(`
      DO $$
      DECLARE
        pk_name TEXT;
        pk_cols INT;
      BEGIN
        SELECT c.conname, array_length(c.conkey, 1)
          INTO pk_name, pk_cols
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'subscription_entitlements' AND c.contype = 'p'
         LIMIT 1;
        IF pk_name IS NOT NULL AND pk_cols = 1 THEN
          EXECUTE format('ALTER TABLE subscription_entitlements DROP CONSTRAINT %I', pk_name);
          EXECUTE 'ALTER TABLE subscription_entitlements ADD PRIMARY KEY (user_id, environment)';
        END IF;
      END $$;
    `);
  } catch (e) {
    // Non-fatal if already migrated
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS refunds (
      internal_refund_id VARCHAR(128) PRIMARY KEY,
      razorpay_refund_id VARCHAR(128) NOT NULL,
      razorpay_payment_id VARCHAR(128) NOT NULL,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      refund_status VARCHAR(32) NOT NULL,
      environment VARCHAR(16) NOT NULL,
      processed_at BIGINT,
      created_at BIGINT NOT NULL,
      UNIQUE (environment, razorpay_refund_id)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds (environment, razorpay_payment_id)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key VARCHAR(16) NOT NULL,
      metric_key VARCHAR(64) NOT NULL,
      environment VARCHAR(16) NOT NULL DEFAULT 'live',
      used_count INT NOT NULL DEFAULT 0,
      reserved_count INT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, period_key, metric_key, environment)
    )
  `);
  try {
    await p.query(`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS environment VARCHAR(16) NOT NULL DEFAULT 'live'`);
    await p.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'usage_counters'::regclass AND contype = 'p'
          AND pg_get_constraintdef(oid) NOT LIKE '%environment%'
        ) THEN
          ALTER TABLE usage_counters DROP CONSTRAINT usage_counters_pkey;
          ALTER TABLE usage_counters ADD PRIMARY KEY (user_id, period_key, metric_key, environment);
        END IF;
      END $$;
    `);
  } catch (e) {}

  await p.query(`
    CREATE TABLE IF NOT EXISTS usage_operations (
      operation_id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key VARCHAR(16) NOT NULL,
      metric_key VARCHAR(64) NOT NULL,
      environment VARCHAR(16) NOT NULL DEFAULT 'live',
      status VARCHAR(32) NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  try {
    await p.query(`ALTER TABLE usage_operations ADD COLUMN IF NOT EXISTS environment VARCHAR(16) NOT NULL DEFAULT 'live'`);
  } catch (e) {}
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_ops_user ON usage_operations (user_id, period_key, environment, status)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS payment_receipts (
      receipt_id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      razorpay_payment_id VARCHAR(128) NOT NULL,
      razorpay_order_id VARCHAR(128) NOT NULL,
      environment VARCHAR(16) NOT NULL,
      plan_id VARCHAR(32) NOT NULL,
      plan_name VARCHAR(64) NOT NULL,
      amount INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      payment_method VARCHAR(64),
      validity_start BIGINT NOT NULL,
      validity_end BIGINT NOT NULL,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      animation_seen_at BIGINT,
      created_at BIGINT NOT NULL,
      UNIQUE (environment, razorpay_payment_id)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_receipts_user ON payment_receipts (user_id, created_at DESC)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      admin_user_id VARCHAR(255) NOT NULL,
      admin_email VARCHAR(255),
      action VARCHAR(128) NOT NULL,
      target_user_id VARCHAR(255),
      environment VARCHAR(16),
      reason TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs (created_at DESC)`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id VARCHAR(64) PRIMARY KEY,
      event_name VARCHAR(64) NOT NULL,
      user_id VARCHAR(255),
      environment VARCHAR(16),
      source VARCHAR(64),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events (event_name, created_at DESC)`);

  // Enable Row Level Security (RLS) on all tables (SEC-RLS)
  try {
    await p.query(`
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE userdata ENABLE ROW LEVEL SECURITY;
      ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
      ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE subscription_entitlements ENABLE ROW LEVEL SECURITY;
      ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
      ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
      ALTER TABLE usage_operations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON payment_orders, payments, webhook_events, subscription_entitlements, refunds, usage_counters, usage_operations, payment_receipts, admin_audit_logs, analytics_events FROM anon, authenticated;
    `);
  } catch (e) {
    // Non-fatal if DB role lacks superuser/owner privileges in dev
  }

  // Ensure default users exist only when explicitly enabled (e.g. initial setup / development)
  if (process.env.SEED_DEFAULT_USERS === "true") {
    console.log("[DB] Seeding default development users...");
    const candidateHash = "$2b$10$.e2vkzVHk2KP.yzsmc4QEuMZaNqW7gzu/gNNxCVbJfJrHEDPUj6aq";
    const adminHash = "$2b$10$T8Z65cO6n/H.0CFp0jd6vewWcFD2sjmyznwxE7LFiEkLn9fKwP84O";

    // Upsert Candidate
    await p.query(
      "INSERT INTO users (id, email, name, password_hash, role, tier, created_at, last_sync) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, email = EXCLUDED.email",
      ["u_0n89pch3tr59", "candidate@jobxapply.app", "John Candidate", candidateHash, "user", "free", Date.now(), Date.now()]
    );
    await p.query(
      "INSERT INTO userdata (user_id, profile, applications) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING",
      ["u_0n89pch3tr59", null, JSON.stringify([])]
    );

    // Upsert Admin
    await p.query(
      "INSERT INTO users (id, email, name, password_hash, role, tier, created_at, last_sync) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, email = EXCLUDED.email",
      ["u_admin12345678", "admin@jobxapply.app", "Admin User", adminHash, "admin", "free", Date.now(), Date.now()]
    );
    await p.query(
      "INSERT INTO userdata (user_id, profile, applications) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING",
      ["u_admin12345678", null, JSON.stringify([])]
    );
    console.log("[DB] Default development users seeded.");
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  try {
    // Default rejectUnauthorized to false to allow Supabase / cloud PostgreSQL cert chains without SELF_SIGNED_CERT_IN_CHAIN errors
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false }
    });
    pool.query("SELECT NOW()")
      .then(async () => {
        try {
          await initializeDatabase(pool);
          usePg = true;
          pgInitialized = true;
          pgInitError = null;
          console.log("[DB] Connection established: Supabase PostgreSQL Cloud DB is ACTIVE.");
        } catch (e) {
          usePg = false;
          pgInitialized = false;
          pgInitError = e.message || "Schema initialization failed";
          console.error("[DB] Database schema initialization failed (fail-closed):", pgInitError);
        }
      })
      .catch(err => {
        usePg = false;
        pgInitialized = false;
        pgInitError = err.message || "Connection error";
        console.error("[DB] PostgreSQL connection failed:", pgInitError);
      });
  } catch (err) {
    usePg = false;
    pgInitialized = false;
    pgInitError = err.message || "Construction error";
    console.error("[DB] Failed to construct pg Pool:", pgInitError);
  }
}

// ─── Async Write Queue — prevents race conditions on concurrent file writes ──
// Each file path gets its own Promise chain. Concurrent writes to the same
// file are serialised; concurrent writes to different files run in parallel.
const _writeQueues = new Map();

function safeWriteFile(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const prev = _writeQueues.get(filePath) || Promise.resolve();
  const next = prev.then(() => fs.promises.writeFile(filePath, json, "utf8")).catch(e => {
    console.error(`[DB] Write failed for ${filePath}:`, e);
  });
  _writeQueues.set(filePath, next);
  return next;
}

function loadRegistry() {
  try {
    if (fs.existsSync(USER_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(USER_INDEX_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error loading user registry:", e);
  }
  return [];
}

function saveRegistry(registry) {
  safeWriteFile(USER_INDEX_FILE, registry);
}

function loadReports() {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      return JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error loading reports:", e);
  }
  return [];
}

function saveReports(reports) {
  safeWriteFile(REPORTS_FILE, reports);
}

function loadTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      const content = fs.readFileSync(TELEMETRY_FILE, "utf8").trim();
      if (content) {
        return JSON.parse(content);
      }
    }
  } catch (e) {
    // Ignore transient parse error during concurrent write
  }
  return { pageViews: 0, apiRequests: 0 };
}

function saveTelemetry(data) {
  safeWriteFile(TELEMETRY_FILE, data);
}

function getUserFilePath(userId) {
  const safeId = String(userId || "").replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId) throw new Error("Invalid User ID");
  return path.join(USERS_DIR, `${safeId}.json`);
}

function loadUserData(userId) {
  const file = getUserFilePath(userId);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (e) {
    console.error(`Error loading user data for ${userId}:`, e);
  }
  return { profile: null, applications: [] };
}

function saveUserData(userId, data) {
  safeWriteFile(getUserFilePath(userId), data);
}

// ─── DB Interface Exports ──────────────────────────────────────────────────
function sanitizeForBackup(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeForBackup);
  const copy = { ...data };
  delete copy.passwordHash;
  delete copy.password_hash;
  delete copy.passcodeHash;
  delete copy.passcode_hash;
  delete copy.resetToken;
  delete copy.reset_token;
  delete copy.resetTokenHash;
  delete copy.reset_token_hash;
  delete copy.reset_token_expiry;
  delete copy.resetTokenExpiry;
  for (const key of Object.keys(copy)) {
    if (copy[key] && typeof copy[key] === "object") {
      copy[key] = sanitizeForBackup(copy[key]);
    }
  }
  return copy;
}

module.exports = {
  // Authentication / Users
  async createUserOnSync({ id, email, name, role = "user", tier = "free" }) {
    if (usePg) {
      const emailLower = email.toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [emailLower]);
      if (existing.rows.length > 0) return;
      await pool.query(
        "INSERT INTO users (id, email, name, role, tier, created_at, last_sync) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [id, emailLower, name || "", role, tier, Date.now(), Date.now()]
      );
      await pool.query(
        "INSERT INTO userdata (user_id, profile, applications) VALUES ($1, $2, $3)",
        [id, null, JSON.stringify([])]
      );
      return;
    }
    const registry = loadRegistry();
    if (registry.find(u => u.email.toLowerCase() === email.toLowerCase())) return;
    const newUser = {
      id,
      email: email.toLowerCase(),
      name: name || "",
      role,
      tier,
      createdAt: Date.now(),
      lastSync: Date.now()
    };
    registry.push(newUser);
    saveRegistry(registry);
  },

  async createUser({ email, name, passwordHash, role = "user" }) {
    if (usePg) {
      const emailLower = email.toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [emailLower]);
      if (existing.rows.length > 0) {
        throw new Error("User already exists");
      }
      const userId = "u_" + Math.random().toString(36).substring(2, 15);
      await pool.query(
        "INSERT INTO users (id, email, name, password_hash, role, tier, created_at, last_sync) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [userId, emailLower, name || "", passwordHash, role, "free", Date.now(), Date.now()]
      );
      await pool.query(
        "INSERT INTO userdata (user_id, profile, applications) VALUES ($1, $2, $3)",
        [userId, null, JSON.stringify([])]
      );
      return {
        id: userId,
        email: emailLower,
        name: name || "",
        passwordHash,
        role,
        tier: "free",
        createdAt: Date.now(),
        lastSync: Date.now()
      };
    }

    const registry = loadRegistry();
    if (registry.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("User already exists");
    }
    const userId = "u_" + Math.random().toString(36).substring(2, 15);
    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      name: name || "",
      passwordHash,
      role,
      tier: "free",
      createdAt: Date.now(),
      lastSync: Date.now()
    };
    registry.push(newUser);
    saveRegistry(registry);
    saveUserData(userId, { profile: null, applications: [] });
    return newUser;
  },

  async getUserByEmail(email) {
    if (usePg) {
      const res = await pool.query("SELECT * FROM users WHERE LOWER(email) = $1", [email.toLowerCase()]);
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.password_hash,
        role: u.role,
        tier: u.tier,
        createdAt: Number(u.created_at),
        lastSync: Number(u.last_sync),
        passcodeHash: u.passcode_hash
      };
    }

    const registry = loadRegistry();
    return registry.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserById(id) {
    if (usePg) {
      const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.password_hash,
        role: u.role,
        tier: u.tier,
        createdAt: Number(u.created_at),
        lastSync: Number(u.last_sync),
        passcodeHash: u.passcode_hash
      };
    }

    const registry = loadRegistry();
    return registry.find(u => u.id === id) || null;
  },

  async getUserByPasscodeHash(passcodeHash) {
    if (!passcodeHash) return null;
    if (usePg) {
      const res = await pool.query("SELECT * FROM users WHERE passcode_hash = $1", [passcodeHash]);
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.password_hash,
        role: u.role,
        tier: u.tier,
        createdAt: Number(u.created_at),
        lastSync: Number(u.last_sync),
        passcodeHash: u.passcode_hash
      };
    }

    const registry = loadRegistry();
    return registry.find(u => u.passcodeHash === passcodeHash) || null;
  },

  async updateUserPasscodeHash(userId, passcodeHash) {
    if (usePg) {
      const res = await pool.query("UPDATE users SET passcode_hash = $1 WHERE id = $2", [passcodeHash, userId]);
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.passcodeHash = passcodeHash;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async updateUserCredentials(userId, { email, name, passwordHash }) {
    if (usePg) {
      const res = await pool.query(
        "UPDATE users SET email = $1, name = $2, password_hash = $3 WHERE id = $4",
        [email, name, passwordHash, userId]
      );
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.email = email;
      user.name = name;
      user.passwordHash = passwordHash;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async setUserResetToken(email, tokenHash, expiry) {
    if (usePg) {
      const res = await pool.query(
        "UPDATE users SET reset_token_hash = $1, reset_token_expiry = $2 WHERE email = $3",
        [tokenHash, expiry, email.toLowerCase().trim()]
      );
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
    if (user) {
      user.resetTokenHash = tokenHash;
      user.resetTokenExpiry = expiry;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async getUserByResetToken(tokenHash) {
    if (usePg) {
      const res = await pool.query(
        "SELECT * FROM users WHERE reset_token_hash = $1",
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.password_hash,
        role: u.role,
        tier: u.tier,
        createdAt: Number(u.created_at),
        lastSync: Number(u.last_sync),
        resetTokenHash: u.reset_token_hash,
        resetTokenExpiry: u.reset_token_expiry ? Number(u.reset_token_expiry) : null
      };
    }

    const registry = loadRegistry();
    const u = registry.find(u => u.resetTokenHash === tokenHash);
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash,
      role: u.role,
      tier: u.tier,
      createdAt: u.createdAt,
      lastSync: u.lastSync,
      resetTokenHash: u.resetTokenHash,
      resetTokenExpiry: u.resetTokenExpiry
    };
  },

  async clearUserResetToken(userId) {
    if (usePg) {
      await pool.query(
        "UPDATE users SET reset_token_hash = NULL, reset_token_expiry = NULL WHERE id = $1",
        [userId]
      );
      return true;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      delete user.resetTokenHash;
      delete user.resetTokenExpiry;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async getUsersList() {
    if (usePg) {
      const res = await pool.query(`
        SELECT u.id, u.email, u.name, u.role, u.tier, u.status, u.created_at, u.last_sync, u.passcode_hash,
               d.profile, d.applications
        FROM users u
        LEFT JOIN userdata d ON u.id = d.user_id
        ORDER BY u.created_at DESC
      `);
      return res.rows.map(u => {
        let appCount = 0;
        let targetRole = "";
        let profileSummary = "";
        if (u.applications) {
          try {
            const apps = typeof u.applications === "string" ? JSON.parse(u.applications) : u.applications;
            if (Array.isArray(apps)) appCount = apps.length;
          } catch(e) {}
        }
        if (u.profile) {
          try {
            const p = typeof u.profile === "string" ? JSON.parse(u.profile) : u.profile;
            targetRole = p.targetRole || p.headline || "";
            profileSummary = p.summary || p.bio || "";
          } catch(e) {}
        }
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          tier: u.tier,
          status: u.status || "active",
          createdAt: Number(u.created_at),
          lastSync: Number(u.last_sync),
          passcodeHash: u.passcode_hash,
          hasProfile: Boolean(u.profile),
          applicationsCount: appCount,
          targetRole: targetRole,
          summary: profileSummary
        };
      });
    }

    const registry = loadRegistry();
    return registry.map(({ passwordHash, ...rest }) => {
      const userData = loadUserData(rest.id);
      let appCount = 0;
      let targetRole = "";
      let profileSummary = "";
      if (Array.isArray(userData.applications)) appCount = userData.applications.length;
      if (userData.profile) {
        targetRole = userData.profile.targetRole || userData.profile.headline || "";
        profileSummary = userData.profile.summary || userData.profile.bio || "";
      }
      return {
        ...rest,
        hasProfile: Boolean(userData.profile),
        applicationsCount: appCount,
        targetRole: targetRole,
        summary: profileSummary
      };
    });
  },

  // Lightweight initialization check — avoids full getUsersList scan on every request
  async hasAnyUsers() {
    if (usePg) {
      const res = await pool.query("SELECT 1 FROM users LIMIT 1");
      return res.rows.length > 0;
    }
    return loadRegistry().length > 0;
  },

  async deleteUser(userId) {
    if (usePg) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      return;
    }

    let registry = loadRegistry();
    registry = registry.filter(u => u.id !== userId);
    saveRegistry(registry);
    const file = getUserFilePath(userId);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  },

  // Profiles
  async getProfile(userId) {
    if (usePg) {
      const res = await pool.query("SELECT profile FROM userdata WHERE user_id = $1", [userId]);
      if (res.rows.length === 0) return null;
      return res.rows[0].profile;
    }

    const data = loadUserData(userId);
    return data.profile;
  },

  async saveProfile(userId, profileData) {
    if (usePg) {
      await pool.query(
        "INSERT INTO userdata (user_id, profile) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET profile = $2",
        [userId, JSON.stringify(profileData)]
      );
      await pool.query("UPDATE users SET last_sync = $1 WHERE id = $2", [Date.now(), userId]);
      return;
    }

    const data = loadUserData(userId);
    data.profile = profileData;
    saveUserData(userId, data);

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.lastSync = Date.now();
      saveRegistry(registry);
    }
  },

  // Applications Tracker
  async getApplications(userId) {
    if (usePg) {
      const res = await pool.query("SELECT applications FROM userdata WHERE user_id = $1", [userId]);
      if (res.rows.length === 0 || !res.rows[0].applications) return [];
      return typeof res.rows[0].applications === "string" 
        ? JSON.parse(res.rows[0].applications)
        : res.rows[0].applications;
    }

    const data = loadUserData(userId);
    return data.applications || [];
  },

  async saveApplications(userId, applications) {
    if (usePg) {
      await pool.query(
        "INSERT INTO userdata (user_id, applications) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET applications = $2",
        [userId, JSON.stringify(applications)]
      );
      return;
    }

    const data = loadUserData(userId);
    data.applications = applications;
    saveUserData(userId, data);
  },

  async saveApplicationsAtomic({ userId, applications, maxLimit = null }) {
    if (usePg && pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO userdata (user_id, applications) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
          [userId, JSON.stringify([])]
        );
        const res = await client.query(
          "SELECT applications FROM userdata WHERE user_id = $1 FOR UPDATE",
          [userId]
        );
        const existingRaw = res.rows[0]?.applications;
        const existingApps = existingRaw
          ? (typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw)
          : [];
        const existingCount = Array.isArray(existingApps) ? existingApps.length : 0;
        const incomingCount = Array.isArray(applications) ? applications.length : 0;

        if (maxLimit !== null && incomingCount > maxLimit && incomingCount > existingCount) {
          await client.query("COMMIT");
          return { ok: false, existingCount, attemptedCount: incomingCount, limit: maxLimit };
        }
        await client.query(
          "UPDATE userdata SET applications = $1 WHERE user_id = $2",
          [JSON.stringify(applications), userId]
        );
        await client.query("COMMIT");
        return { ok: true, syncedCount: incomingCount };
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) {}
        throw err;
      } finally {
        client.release();
      }
    }

    // Non-PG serialized atomic check-and-save via memTxQueue
    const run = async () => {
      const data = loadUserData(userId);
      const existingApps = Array.isArray(data.applications) ? data.applications : [];
      const existingCount = existingApps.length;
      const incomingCount = Array.isArray(applications) ? applications.length : 0;
      if (maxLimit !== null && incomingCount > maxLimit && incomingCount > existingCount) {
        return { ok: false, existingCount, attemptedCount: incomingCount, limit: maxLimit };
      }
      data.applications = applications;
      await saveUserData(userId, data);
      return { ok: true, syncedCount: incomingCount };
    };
    const next = memTxQueue.then(run, run);
    memTxQueue = next.catch(() => {});
    return next;
  },

  // Reports Queue
  async createReport(report) {
    if (usePg) {
      const newReport = {
        id: "rep_" + Math.random().toString(36).substring(2, 11),
        portal: report.portal,
        field: report.field,
        selectorTried: report.selectorTried,
        reporterEmail: report.reporterEmail || "anonymous",
        submittedAt: Date.now(),
        status: "pending"
      };
      await pool.query(
        "INSERT INTO reports (id, portal, field, selector_tried, reporter_email, submitted_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [newReport.id, newReport.portal, newReport.field, newReport.selectorTried, newReport.reporterEmail, newReport.submittedAt, newReport.status]
      );
      return newReport;
    }

    const reports = loadReports();
    const newReport = {
      id: "rep_" + Math.random().toString(36).substring(2, 11),
      portal: report.portal,
      field: report.field,
      selectorTried: report.selectorTried,
      reporterEmail: report.reporterEmail || "anonymous",
      submittedAt: Date.now(),
      status: "pending"
    };
    reports.push(newReport);
    saveReports(reports);
    return newReport;
  },

  async getReports() {
    if (usePg) {
      const res = await pool.query("SELECT * FROM reports");
      return res.rows.map(r => ({
        id: r.id,
        portal: r.portal,
        field: r.field,
        selectorTried: r.selector_tried,
        reporterEmail: r.reporter_email,
        submittedAt: Number(r.submitted_at),
        status: r.status
      }));
    }

    return loadReports();
  },

  async updateReportStatus(reportId, status) {
    if (usePg) {
      const res = await pool.query(
        "UPDATE reports SET status = $1 WHERE id = $2 RETURNING *",
        [status, reportId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        portal: r.portal,
        field: r.field,
        selectorTried: r.selector_tried,
        reporterEmail: r.reporter_email,
        submittedAt: Number(r.submitted_at),
        status: r.status
      };
    }

    const reports = loadReports();
    const report = reports.find(r => r.id === reportId);
    if (report) {
      report.status = status;
      saveReports(reports);
      return report;
    }
    return null;
  },

  async updateUserTier(userId, tier) {
    if (usePg) {
      const res = await pool.query("UPDATE users SET tier = $1 WHERE id = $2", [tier, userId]);
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.tier = tier;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async updateUserStatus(userId, status) {
    if (usePg) {
      const res = await pool.query("UPDATE users SET status = $1 WHERE id = $2", [status, userId]);
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.status = status;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async updateUserRole(userId, role) {
    if (usePg) {
      const res = await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
      return res.rowCount > 0;
    }

    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.role = role;
      saveRegistry(registry);
      return true;
    }
    return false;
  },

  async resolveReport(reportId) {
    if (usePg) {
      const res = await pool.query("UPDATE reports SET status = 'resolved' WHERE id = $1", [reportId]);
      return res.rowCount > 0;
    }

    const reports = loadReports();
    const report = reports.find(r => r.id === reportId);
    if (report) {
      report.status = "resolved";
      saveReports(reports);
      return true;
    }
    return false;
  },

  async recordTelemetryHit(metric) {
    if (usePg) {
      await pool.query(
        "INSERT INTO telemetry (metric_key, metric_value) VALUES ($1, 1) ON CONFLICT (metric_key) DO UPDATE SET metric_value = telemetry.metric_value + 1",
        [metric]
      );
      return;
    }

    const tel = loadTelemetry();
    if (tel[metric] !== undefined) {
      tel[metric]++;
    } else {
      tel[metric] = 1;
    }
    saveTelemetry(tel);
  },

  // Telemetry Stats
  async getStats() {
    if (usePg) {
      const userCountRes = await pool.query("SELECT COUNT(*) FROM users");
      const reportCountRes = await pool.query("SELECT COUNT(*) FROM reports");
      const pendingReportRes = await pool.query("SELECT COUNT(*) FROM reports WHERE status = 'pending'");
      
      const freeUsersRes = await pool.query("SELECT COUNT(*) FROM users WHERE tier NOT IN ('paid', 'pro', 'operative', 'command')");
      const paidUsersRes = await pool.query("SELECT COUNT(*) FROM users WHERE tier IN ('paid', 'pro', 'operative', 'command')");

      const telemetryRes = await pool.query("SELECT metric_key, metric_value FROM telemetry");
      const tel = {};
      telemetryRes.rows.forEach(r => {
        tel[r.metric_key] = r.metric_value;
      });

      const userdataRes = await pool.query("SELECT profile, applications FROM userdata");
      let totalApps = 0;
      let profilesCount = 0;
      userdataRes.rows.forEach(d => {
        if (d.profile) profilesCount++;
        const apps = typeof d.applications === "string" ? JSON.parse(d.applications) : d.applications;
        if (Array.isArray(apps)) totalApps += apps.length;
      });

      return {
        totalUsers: Number(userCountRes.rows[0].count),
        totalProfiles: profilesCount,
        totalApplications: totalApps,
        totalReports: Number(reportCountRes.rows[0].count),
        pendingReports: Number(pendingReportRes.rows[0].count),
        freeUsers: Number(freeUsersRes.rows[0].count),
        paidUsers: Number(paidUsersRes.rows[0].count),
        pageViews: tel.pageViews || 0,
        apiRequests: tel.apiRequests || 0,
        atsScans: tel.atsScans || 0,
        resumeBuilds: tel.resumeBuilds || 0,
        coverLetters: tel.coverLetters || 0,
        autofillHits: tel.autofillHits || 0,
        extensionDownloads: tel.extensionDownloads || 0
      };
    }

    const registry = loadRegistry();
    const reports = loadReports();
    const tel = loadTelemetry();

    let totalApps = 0;
    let profilesCount = 0;
    let freeCount = 0;
    let paidCount = 0;

    registry.forEach(u => {
      const data = loadUserData(u.id);
      if (data.profile) profilesCount++;
      if (Array.isArray(data.applications)) totalApps += data.applications.length;
      if (u.tier === "paid" || u.tier === "pro" || u.tier === "operative" || u.tier === "command") {
        paidCount++;
      } else {
        freeCount++;
      }
    });

    return {
      totalUsers: registry.length,
      totalProfiles: profilesCount,
      totalApplications: totalApps,
      totalReports: reports.length,
      pendingReports: reports.filter(r => r.status === "pending").length,
      freeUsers: freeCount,
      paidUsers: paidCount,
      pageViews: tel.pageViews || 0,
      apiRequests: tel.apiRequests || 0,
      atsScans: tel.atsScans || 0,
      resumeBuilds: tel.resumeBuilds || 0,
      coverLetters: tel.coverLetters || 0,
      autofillHits: tel.autofillHits || 0,
      extensionDownloads: tel.extensionDownloads || 0
    };
  },

  // ── CMS Dynamic Site Configuration ──────────────────────────────
  async getCmsConfig() {
    const CMS_FILE = path.join(__dirname, "..", "database", "platform-cms.json");
    const defaultConfig = {
      hero: {
        tag: "MISSION-CLASS CAREER AUTOMATION",
        title: "APPLY EVERYWHERE. REPEAT NOTHING.",
        subtitle: "One master profile. 50+ job portals. Instant auto-fill, algorithmic ATS resume scoring, and targeted cover letter generator. Zero friction.",
        ctaText: "LAUNCH OPERATIVE CONSOLE",
        stats: {
          supportedPortals: "50+",
          timeSavedPct: "85%",
          atsPassRate: "92%"
        }
      },
      maintenance: {
        active: false,
        message: "Scheduled platform upgrade in progress. Check back shortly."
      },
      announcement: {
        active: false,
        text: "",
        link: ""
      }
    };
    try {
      if (fs.existsSync(CMS_FILE)) {
        const raw = fs.readFileSync(CMS_FILE, "utf-8");
        return Object.assign({}, defaultConfig, JSON.parse(raw));
      }
    } catch (e) {
      console.error("[DB] Error loading CMS config:", e);
    }
    return defaultConfig;
  },

  async saveCmsConfig(config) {
    const CMS_FILE = path.join(__dirname, "..", "database", "platform-cms.json");
    try {
      fs.writeFileSync(CMS_FILE, JSON.stringify(config, null, 2), "utf-8");
      return true;
    } catch (e) {
      console.error("[DB] Error saving CMS config:", e);
      return false;
    }
  },

  // ── Full Database Snapshot & Backup ──────────────────────────────
  async getDatabaseBackup() {
    const registry = loadRegistry();
    const reports = loadReports();
    const telemetry = loadTelemetry();
    const userDataDump = {};

    registry.forEach(u => {
      try {
        userDataDump[u.id] = loadUserData(u.id);
      } catch (e) {
        userDataDump[u.id] = null;
      }
    });

    const cms = await this.getCmsConfig();

    return {
      exportedAt: new Date().toISOString(),
      version: "2.0.0",
      registry: registry.map(u => sanitizeForBackup(u)),
      userData: sanitizeForBackup(userDataDump),
      reports,
      telemetry,
      cms
    };
  },

  // ── Transactional Payment, Webhook, Entitlement & Refund Repository ──
  isPgAvailable() {
    return usePg && Boolean(pool) && pgInitialized;
  },

  getPgInitError() {
    return pgInitError;
  },

  assertPaymentPersistenceAvailable() {
    if (!this.isPgAvailable() && (process.env.NODE_ENV === "production" || process.env.REQUIRE_PG_FOR_PAYMENTS === "true")) {
      const err = new Error("PostgreSQL database is unavailable. Financial operations are disabled (fail-closed).");
      err.statusCode = 503;
      throw err;
    }
  },

  async withPaymentTransaction(fn) {
    this.assertPaymentPersistenceAvailable();

    if (usePg && pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = createPgPaymentTx(client);
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (rbErr) {}
        throw err;
      } finally {
        client.release();
      }
    }

    // Non-production serialized in-memory transaction with snapshot rollback
    return await runInMemoryTx(fn, this);
  },

  async getEntitlement(userId, environment = "live") {
    if (usePg && pool) {
      const res = await pool.query(
        "SELECT * FROM subscription_entitlements WHERE user_id = $1 AND environment = $2",
        [userId, environment]
      );
      if (res.rows.length === 0) return null;
      return mapPgEntitlement(res.rows[0]);
    }
    return memPaymentStore.entitlements.get(`${userId}:${environment}`) || null;
  },

  async getPendingOrdersByUser(userId, environment) {
    this.assertPaymentPersistenceAvailable();
    if (usePg && pool) {
      const res = await pool.query(
        "SELECT * FROM payment_orders WHERE user_id = $1 AND environment = $2 AND status IN ('created', 'attempted') ORDER BY created_at DESC LIMIT 10",
        [userId, environment]
      );
      return res.rows.map(mapPgOrder);
    }
    return Array.from(memPaymentStore.orders.values())
      .filter(o => o.userId === userId && o.environment === environment && (o.status === "created" || o.status === "attempted"))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
  },

  async getPaymentsByUser(userId) {
    if (usePg && pool) {
      const res = await pool.query("SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [userId]);
      return res.rows.map(mapPgPayment);
    }
    return Array.from(memPaymentStore.payments.values())
      .filter(p => p.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  },

  async resetInMemoryPaymentStoreForTests() {
    if (process.env.NODE_ENV === "production") return;
    memPaymentStore.orders.clear();
    memPaymentStore.payments.clear();
    memPaymentStore.webhooks.clear();
    memPaymentStore.entitlements.clear();
    memPaymentStore.refunds.clear();
    memPaymentStore.usageCounters.clear();
    memPaymentStore.usageOperations.clear();
    memPaymentStore.receipts.clear();
    memPaymentStore.adminAuditLogs.length = 0;
    memPaymentStore.analyticsEvents.length = 0;
  },

  // ── Usage Counters & Atomic Reservation/Finalization ──
  async getUsageCounters(userId, periodKey, environment = "live") {
    if (usePg && pool) {
      const res = await pool.query(
        "SELECT metric_key, used_count, reserved_count, updated_at FROM usage_counters WHERE user_id = $1 AND period_key = $2 AND environment = $3",
        [userId, periodKey, environment]
      );
      const map = {};
      for (const row of res.rows) {
        map[row.metric_key] = {
          used: Number(row.used_count || 0),
          reserved: Number(row.reserved_count || 0),
          updatedAt: Number(row.updated_at || 0)
        };
      }
      return map;
    }
    const map = {};
    const prefix = `${userId}:${periodKey}:${environment}:`;
    for (const [k, v] of memPaymentStore.usageCounters.entries()) {
      if (k.startsWith(prefix)) {
        const metricKey = k.slice(prefix.length);
        map[metricKey] = { used: v.usedCount, reserved: v.reservedCount, updatedAt: v.updatedAt };
      }
    }
    return map;
  },

  async reserveUsageOperation({ operationId, userId, periodKey, metricKey, environment = "live", limit, metadata = {}, ttlMs = 120000 }) {
    const now = Date.now();
    const expiresAt = now + ttlMs;

    if (usePg && pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Clean up expired reservations for this user/period/metric/environment
        const expRes = await client.query(
          "UPDATE usage_operations SET status = 'expired', updated_at = $1 WHERE user_id = $2 AND period_key = $3 AND metric_key = $4 AND environment = $5 AND status = 'reserved' AND expires_at <= $1 RETURNING operation_id",
          [now, userId, periodKey, metricKey, environment]
        );
        if (expRes.rows.length > 0) {
          await client.query(
            "UPDATE usage_counters SET reserved_count = GREATEST(0, reserved_count - $1), updated_at = $2 WHERE user_id = $3 AND period_key = $4 AND metric_key = $5 AND environment = $6",
            [expRes.rows.length, now, userId, periodKey, metricKey, environment]
          );
        }

        // Check idempotency / cross-account safety if operationId already exists
        const existingOp = await client.query(
          "SELECT * FROM usage_operations WHERE operation_id = $1 FOR UPDATE",
          [operationId]
        );
        if (existingOp.rows.length > 0) {
          const row = existingOp.rows[0];
          if (row.user_id !== userId) {
            await client.query("COMMIT");
            return { ok: false, reason: "CROSS_ACCOUNT_OPERATION" };
          }
          const cRes = await client.query(
            "SELECT used_count, reserved_count FROM usage_counters WHERE user_id = $1 AND period_key = $2 AND metric_key = $3 AND environment = $4",
            [userId, periodKey, metricKey, environment]
          );
          const ctr = cRes.rows[0] || { used_count: 0, reserved_count: 0 };
          await client.query("COMMIT");
          return {
            ok: row.status === "reserved" || row.status === "finalized",
            idempotent: true,
            operationId,
            status: row.status,
            used: Number(ctr.used_count || 0),
            reserved: Number(ctr.reserved_count || 0)
          };
        }

        await client.query(
          `INSERT INTO usage_counters (user_id, period_key, metric_key, environment, used_count, reserved_count, updated_at)
           VALUES ($1, $2, $3, $4, 0, 0, $5)
           ON CONFLICT (user_id, period_key, metric_key, environment) DO NOTHING`,
          [userId, periodKey, metricKey, environment, now]
        );
        const cRes = await client.query(
          "SELECT used_count, reserved_count FROM usage_counters WHERE user_id = $1 AND period_key = $2 AND metric_key = $3 AND environment = $4 FOR UPDATE",
          [userId, periodKey, metricKey, environment]
        );
        const used = Number(cRes.rows[0]?.used_count || 0);
        const reserved = Number(cRes.rows[0]?.reserved_count || 0);

        if (limit !== null && limit !== undefined && (used + reserved) >= limit) {
          await client.query("COMMIT");
          return { ok: false, reason: "QUOTA_EXCEEDED", used, reserved, limit };
        }

        await client.query(
          "UPDATE usage_counters SET reserved_count = reserved_count + 1, updated_at = $1 WHERE user_id = $2 AND period_key = $3 AND metric_key = $4 AND environment = $5",
          [now, userId, periodKey, metricKey, environment]
        );
        await client.query(
          `INSERT INTO usage_operations (operation_id, user_id, period_key, metric_key, environment, status, metadata, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'reserved', $6, $7, $8, $8)`,
          [operationId, userId, periodKey, metricKey, environment, JSON.stringify(metadata || {}), expiresAt, now]
        );
        await client.query("COMMIT");
        return { ok: true, operationId, status: "reserved", used, reserved: reserved + 1, limit };
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) {}
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory serialized path via memTxQueue
    const run = async () => {
      const key = `${userId}:${periodKey}:${environment}:${metricKey}`;
      let ctr = memPaymentStore.usageCounters.get(key);
      if (!ctr) {
        ctr = { userId, periodKey, metricKey, environment, usedCount: 0, reservedCount: 0, updatedAt: now };
        memPaymentStore.usageCounters.set(key, ctr);
      }
      for (const op of memPaymentStore.usageOperations.values()) {
        if (op.userId === userId && op.periodKey === periodKey && op.metricKey === metricKey && op.environment === environment && op.status === "reserved" && op.expiresAt <= now) {
          op.status = "expired";
          op.updatedAt = now;
          ctr.reservedCount = Math.max(0, ctr.reservedCount - 1);
        }
      }
      const existing = memPaymentStore.usageOperations.get(operationId);
      if (existing) {
        if (existing.userId !== userId) {
          return { ok: false, reason: "CROSS_ACCOUNT_OPERATION" };
        }
        return {
          ok: existing.status === "reserved" || existing.status === "finalized",
          idempotent: true,
          operationId,
          status: existing.status,
          used: ctr.usedCount,
          reserved: ctr.reservedCount
        };
      }
      if (limit !== null && limit !== undefined && (ctr.usedCount + ctr.reservedCount) >= limit) {
        return { ok: false, reason: "QUOTA_EXCEEDED", used: ctr.usedCount, reserved: ctr.reservedCount, limit };
      }
      ctr.reservedCount += 1;
      ctr.updatedAt = now;
      memPaymentStore.usageOperations.set(operationId, {
        operationId, userId, periodKey, metricKey, environment, status: "reserved", metadata, expiresAt, createdAt: now, updatedAt: now
      });
      return { ok: true, operationId, status: "reserved", used: ctr.usedCount, reserved: ctr.reservedCount, limit };
    };
    const next = memTxQueue.then(run, run);
    memTxQueue = next.catch(() => {});
    return next;
  },

  async finalizeUsageOperation(operationId, userId) {
    const now = Date.now();
    if (usePg && pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          "SELECT * FROM usage_operations WHERE operation_id = $1 AND user_id = $2 FOR UPDATE",
          [operationId, userId]
        );
        if (!res.rows.length) {
          await client.query("COMMIT");
          return { ok: false, error: "Operation not found" };
        }
        const op = res.rows[0];
        if (op.status === "finalized") {
          await client.query("COMMIT");
          return { ok: true, idempotent: true, status: "finalized" };
        }
        if (op.status === "released") {
          await client.query("COMMIT");
          return { ok: false, error: "Operation already released" };
        }
        await client.query(
          "UPDATE usage_operations SET status = 'finalized', updated_at = $1 WHERE operation_id = $2",
          [now, operationId]
        );
        if (op.status === "reserved") {
          await client.query(
            `UPDATE usage_counters
             SET used_count = used_count + 1,
                 reserved_count = GREATEST(0, reserved_count - 1),
                 updated_at = $1
             WHERE user_id = $2 AND period_key = $3 AND metric_key = $4 AND environment = $5`,
            [now, op.user_id, op.period_key, op.metric_key, op.environment || "live"]
          );
        } else {
          await client.query(
            `UPDATE usage_counters SET used_count = used_count + 1, updated_at = $1
             WHERE user_id = $2 AND period_key = $3 AND metric_key = $4 AND environment = $5`,
            [now, op.user_id, op.period_key, op.metric_key, op.environment || "live"]
          );
        }
        await client.query("COMMIT");
        return { ok: true, status: "finalized" };
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) {}
        throw err;
      } finally {
        client.release();
      }
    }

    const op = memPaymentStore.usageOperations.get(operationId);
    if (!op || op.userId !== userId) return { ok: false, error: "Operation not found" };
    if (op.status === "finalized") return { ok: true, idempotent: true, status: "finalized" };
    if (op.status === "released") return { ok: false, error: "Operation already released" };
    const ctr = memPaymentStore.usageCounters.get(`${op.userId}:${op.periodKey}:${op.environment || "live"}:${op.metricKey}`);
    if (ctr) {
      if (op.status === "reserved") ctr.reservedCount = Math.max(0, ctr.reservedCount - 1);
      ctr.usedCount += 1;
      ctr.updatedAt = now;
    }
    op.status = "finalized";
    op.updatedAt = now;
    return { ok: true, status: "finalized" };
  },

  async releaseUsageOperation(operationId, userId) {
    const now = Date.now();
    if (usePg && pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          "SELECT * FROM usage_operations WHERE operation_id = $1 AND user_id = $2 FOR UPDATE",
          [operationId, userId]
        );
        if (!res.rows.length) {
          await client.query("COMMIT");
          return { ok: false, error: "Operation not found" };
        }
        const op = res.rows[0];
        if (op.status === "released") {
          await client.query("COMMIT");
          return { ok: true, idempotent: true, status: "released" };
        }
        if (op.status === "finalized") {
          await client.query("COMMIT");
          return { ok: false, error: "Operation already finalized" };
        }
        await client.query(
          "UPDATE usage_operations SET status = 'released', updated_at = $1 WHERE operation_id = $2",
          [now, operationId]
        );
        if (op.status === "reserved") {
          await client.query(
            `UPDATE usage_counters SET reserved_count = GREATEST(0, reserved_count - 1), updated_at = $1
             WHERE user_id = $2 AND period_key = $3 AND metric_key = $4 AND environment = $5`,
            [now, op.user_id, op.period_key, op.metric_key, op.environment || "live"]
          );
        }
        await client.query("COMMIT");
        return { ok: true, status: "released" };
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) {}
        throw err;
      } finally {
        client.release();
      }
    }

    const op = memPaymentStore.usageOperations.get(operationId);
    if (!op || op.userId !== userId) return { ok: false, error: "Operation not found" };
    if (op.status === "released") return { ok: true, idempotent: true, status: "released" };
    if (op.status === "finalized") return { ok: false, error: "Operation already finalized" };
    const ctr = memPaymentStore.usageCounters.get(`${op.userId}:${op.periodKey}:${op.environment || "live"}:${op.metricKey}`);
    if (ctr && op.status === "reserved") {
      ctr.reservedCount = Math.max(0, ctr.reservedCount - 1);
      ctr.updatedAt = now;
    }
    op.status = "released";
    op.updatedAt = now;
    return { ok: true, status: "released" };
  },

  // ── Receipts, Admin Audit Logs, Admin Queries & Funnel Analytics ──
  async getReceiptsByUser(userId, environment = null) {
    if (usePg && pool) {
      const q = environment
        ? "SELECT * FROM payment_receipts WHERE user_id = $1 AND environment = $2 ORDER BY created_at DESC LIMIT 50"
        : "SELECT * FROM payment_receipts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50";
      const params = environment ? [userId, environment] : [userId];
      const res = await pool.query(q, params);
      return res.rows.map(mapPgReceipt);
    }
    return Array.from(memPaymentStore.receipts.values())
      .filter(r => r.userId === userId && (!environment || r.environment === environment))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  },

  async getReceiptByPaymentIdForUser(razorpayPaymentId, userId, environment = null) {
    if (usePg && pool) {
      const q = environment
        ? "SELECT * FROM payment_receipts WHERE razorpay_payment_id = $1 AND user_id = $2 AND environment = $3 LIMIT 1"
        : "SELECT * FROM payment_receipts WHERE razorpay_payment_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1";
      const params = environment ? [razorpayPaymentId, userId, environment] : [razorpayPaymentId, userId];
      const res = await pool.query(q, params);
      return res.rows.length ? mapPgReceipt(res.rows[0]) : null;
    }
    return Array.from(memPaymentStore.receipts.values()).find(
      r => r.razorpayPaymentId === razorpayPaymentId && r.userId === userId && (!environment || r.environment === environment)
    ) || null;
  },

  async markReceiptAnimationSeen(receiptId, userId) {
    const now = Date.now();
    if (usePg && pool) {
      const res = await pool.query(
        "UPDATE payment_receipts SET animation_seen_at = COALESCE(animation_seen_at, $1) WHERE receipt_id = $2 AND user_id = $3 RETURNING animation_seen_at",
        [now, receiptId, userId]
      );
      return res.rows.length ? Number(res.rows[0].animation_seen_at) : null;
    }
    const r = memPaymentStore.receipts.get(receiptId);
    if (!r || r.userId !== userId) return null;
    if (!r.animationSeenAt) r.animationSeenAt = now;
    return r.animationSeenAt;
  },

  async recordAdminAuditLog(entry) {
    const id = entry.id || `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      adminUserId: String(entry.adminUserId || "admin"),
      adminEmail: entry.adminEmail || null,
      action: String(entry.action || "unknown"),
      targetUserId: entry.targetUserId || null,
      environment: entry.environment || null,
      reason: entry.reason || null,
      metadata: entry.metadata || {},
      createdAt: entry.createdAt || Date.now()
    };
    if (usePg && pool) {
      await pool.query(
        `INSERT INTO admin_audit_logs (id, admin_user_id, admin_email, action, target_user_id, environment, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [row.id, row.adminUserId, row.adminEmail, row.action, row.targetUserId, row.environment, row.reason, JSON.stringify(row.metadata), row.createdAt]
      );
      return row;
    }
    memPaymentStore.adminAuditLogs.unshift(row);
    if (memPaymentStore.adminAuditLogs.length > 500) memPaymentStore.adminAuditLogs.length = 500;
    return row;
  },

  async getAdminAuditLogs(limit = 50) {
    if (usePg && pool) {
      const res = await pool.query("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1", [limit]);
      return res.rows.map(r => ({
        id: r.id,
        adminUserId: r.admin_user_id,
        adminEmail: r.admin_email,
        action: r.action,
        targetUserId: r.target_user_id,
        environment: r.environment,
        reason: r.reason,
        metadata: r.metadata || {},
        createdAt: Number(r.created_at)
      }));
    }
    return memPaymentStore.adminAuditLogs.slice(0, limit);
  },

  async recordAnalyticsEvent(evt) {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      eventName: String(evt.eventName || "unknown").slice(0, 64),
      userId: evt.userId || null,
      environment: evt.environment || null,
      source: evt.source ? String(evt.source).slice(0, 64) : null,
      metadata: evt.metadata || {},
      createdAt: evt.createdAt || Date.now()
    };
    if (usePg && pool) {
      await pool.query(
        `INSERT INTO analytics_events (id, event_name, user_id, environment, source, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.eventName, row.userId, row.environment, row.source, JSON.stringify(row.metadata), row.createdAt]
      );
      return row;
    }
    memPaymentStore.analyticsEvents.unshift(row);
    if (memPaymentStore.analyticsEvents.length > 2000) memPaymentStore.analyticsEvents.length = 2000;
    return row;
  },

  async getAnalyticsSummary(environment = null) {
    const counts = {};
    if (usePg && pool) {
      const q = environment
        ? "SELECT event_name, COUNT(*)::int AS cnt FROM analytics_events WHERE environment = $1 GROUP BY event_name"
        : "SELECT event_name, COUNT(*)::int AS cnt FROM analytics_events GROUP BY event_name";
      const res = await pool.query(q, environment ? [environment] : []);
      for (const r of res.rows) counts[r.event_name] = Number(r.cnt || 0);
      return counts;
    }
    for (const e of memPaymentStore.analyticsEvents) {
      if (!environment || e.environment === environment) {
        counts[e.eventName] = (counts[e.eventName] || 0) + 1;
      }
    }
    return counts;
  },

  async getAdminPayments({ environment = null, limit = 100 } = {}) {
    if (usePg && pool) {
      const q = environment
        ? "SELECT * FROM payments WHERE environment = $1 ORDER BY created_at DESC LIMIT $2"
        : "SELECT * FROM payments ORDER BY created_at DESC LIMIT $1";
      const res = await pool.query(q, environment ? [environment, limit] : [limit]);
      return res.rows.map(mapPgPayment);
    }
    return Array.from(memPaymentStore.payments.values())
      .filter(p => !environment || p.environment === environment)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },

  async getAdminWebhooks({ environment = null, limit = 100 } = {}) {
    if (usePg && pool) {
      const q = environment
        ? "SELECT * FROM webhook_events WHERE environment = $1 ORDER BY received_at DESC LIMIT $2"
        : "SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT $1";
      const res = await pool.query(q, environment ? [environment, limit] : [limit]);
      return res.rows.map(mapPgWebhook);
    }
    return Array.from(memPaymentStore.webhooks.values())
      .filter(w => !environment || w.environment === environment)
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, limit);
  },

  async getAdminRefunds({ environment = null, limit = 100 } = {}) {
    if (usePg && pool) {
      const q = environment
        ? "SELECT * FROM refunds WHERE environment = $1 ORDER BY created_at DESC LIMIT $2"
        : "SELECT * FROM refunds ORDER BY created_at DESC LIMIT $1";
      const res = await pool.query(q, environment ? [environment, limit] : [limit]);
      return res.rows.map(mapPgRefund);
    }
    return Array.from(memPaymentStore.refunds.values())
      .filter(r => !environment || r.environment === environment)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
};

// ── PostgreSQL Row Mappers & Transaction Adapter ──
function mapPgOrder(r) {
  return {
    internalOrderId: r.internal_order_id,
    userId: r.user_id,
    razorpayOrderId: r.razorpay_order_id,
    planId: r.plan_id,
    expectedAmount: Number(r.expected_amount),
    currency: r.currency,
    durationDays: Number(r.duration_days),
    environment: r.environment,
    status: r.status,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  };
}

function mapPgPayment(r) {
  return {
    internalPaymentId: r.internal_payment_id,
    internalOrderId: r.internal_order_id,
    userId: r.user_id,
    razorpayOrderId: r.razorpay_order_id,
    razorpayPaymentId: r.razorpay_payment_id,
    amount: Number(r.amount),
    currency: r.currency,
    paymentStatus: r.payment_status,
    captureStatus: r.capture_status,
    method: r.method,
    environment: r.environment,
    verifiedAt: r.verified_at ? Number(r.verified_at) : null,
    entitlementStatus: r.entitlement_status,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  };
}

function mapPgEntitlement(r) {
  return {
    userId: r.user_id,
    planId: r.plan_id,
    status: r.status,
    startedAt: r.started_at ? Number(r.started_at) : null,
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    sourcePaymentId: r.source_payment_id || null,
    environment: r.environment,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  };
}

function mapPgWebhook(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    eventType: r.event_type,
    environment: r.environment,
    processingStatus: r.processing_status,
    attempts: Number(r.attempts),
    receivedAt: Number(r.received_at),
    processedAt: r.processed_at ? Number(r.processed_at) : null,
    errorMessage: r.error_message || null
  };
}

function mapPgRefund(r) {
  return {
    internalRefundId: r.internal_refund_id,
    razorpayRefundId: r.razorpay_refund_id,
    razorpayPaymentId: r.razorpay_payment_id,
    userId: r.user_id,
    amount: Number(r.amount),
    currency: r.currency,
    refundStatus: r.refund_status,
    environment: r.environment,
    processedAt: r.processed_at ? Number(r.processed_at) : null,
    createdAt: Number(r.created_at)
  };
}

function createPgPaymentTx(client) {
  return {
    async insertOrder(o) {
      await client.query(
        `INSERT INTO payment_orders (internal_order_id, user_id, razorpay_order_id, plan_id, expected_amount, currency, duration_days, environment, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [o.internalOrderId, o.userId, o.razorpayOrderId, o.planId, o.expectedAmount, o.currency, o.durationDays, o.environment, o.status, o.createdAt, o.updatedAt]
      );
      return o;
    },
    async getOrderByRazorpayIdForUpdate(environment, razorpayOrderId) {
      const res = await client.query(
        "SELECT * FROM payment_orders WHERE environment = $1 AND razorpay_order_id = $2 FOR UPDATE",
        [environment, razorpayOrderId]
      );
      return res.rows.length ? mapPgOrder(res.rows[0]) : null;
    },
    async updateOrderStatus(internalOrderId, status) {
      await client.query(
        "UPDATE payment_orders SET status = $1, updated_at = $2 WHERE internal_order_id = $3",
        [status, Date.now(), internalOrderId]
      );
    },
    async getPaymentByRazorpayIdForUpdate(environment, razorpayPaymentId) {
      const res = await client.query(
        "SELECT * FROM payments WHERE environment = $1 AND razorpay_payment_id = $2 FOR UPDATE",
        [environment, razorpayPaymentId]
      );
      return res.rows.length ? mapPgPayment(res.rows[0]) : null;
    },
    async upsertPayment(p) {
      await client.query(
        `INSERT INTO payments (internal_payment_id, internal_order_id, user_id, razorpay_order_id, razorpay_payment_id, amount, currency, payment_status, capture_status, method, environment, verified_at, entitlement_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (environment, razorpay_payment_id) DO UPDATE SET
           payment_status = EXCLUDED.payment_status,
           capture_status = EXCLUDED.capture_status,
           method = COALESCE(EXCLUDED.method, payments.method),
           verified_at = COALESCE(EXCLUDED.verified_at, payments.verified_at),
           entitlement_status = EXCLUDED.entitlement_status,
           updated_at = EXCLUDED.updated_at`,
        [p.internalPaymentId, p.internalOrderId, p.userId, p.razorpayOrderId, p.razorpayPaymentId, p.amount, p.currency, p.paymentStatus, p.captureStatus, p.method || null, p.environment, p.verifiedAt || null, p.entitlementStatus, p.createdAt, p.updatedAt]
      );
      return p;
    },
    async getEntitlementForUpdate(userId, environment = "live") {
      const res = await client.query(
        "SELECT * FROM subscription_entitlements WHERE user_id = $1 AND environment = $2 FOR UPDATE",
        [userId, environment]
      );
      return res.rows.length ? mapPgEntitlement(res.rows[0]) : null;
    },
    async upsertEntitlement(e) {
      await client.query(
        `INSERT INTO subscription_entitlements (user_id, plan_id, status, started_at, expires_at, source_payment_id, environment, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, environment) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           started_at = COALESCE(EXCLUDED.started_at, subscription_entitlements.started_at),
           expires_at = EXCLUDED.expires_at,
           source_payment_id = EXCLUDED.source_payment_id,
           updated_at = EXCLUDED.updated_at`,
        [e.userId, e.planId, e.status, e.startedAt, e.expiresAt, e.sourcePaymentId, e.environment, e.createdAt, e.updatedAt]
      );
      return e;
    },
    async updateUserTier(userId, tier) {
      await client.query("UPDATE users SET tier = $1 WHERE id = $2", [tier, userId]);
    },
    async getWebhookEventForUpdate(environment, eventId) {
      const res = await client.query(
        "SELECT * FROM webhook_events WHERE environment = $1 AND event_id = $2 FOR UPDATE",
        [environment, eventId]
      );
      return res.rows.length ? mapPgWebhook(res.rows[0]) : null;
    },
    async upsertWebhookEvent(w) {
      await client.query(
        `INSERT INTO webhook_events (id, event_id, event_type, environment, processing_status, attempts, received_at, processed_at, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (environment, event_id) DO UPDATE SET
           processing_status = EXCLUDED.processing_status,
           attempts = webhook_events.attempts + 1,
           processed_at = EXCLUDED.processed_at,
           error_message = EXCLUDED.error_message`,
        [w.id, w.eventId, w.eventType, w.environment, w.processingStatus, w.attempts || 1, w.receivedAt, w.processedAt || null, w.errorMessage || null]
      );
      return w;
    },
    async getRefundByRazorpayIdForUpdate(environment, razorpayRefundId) {
      const res = await client.query(
        "SELECT * FROM refunds WHERE environment = $1 AND razorpay_refund_id = $2 FOR UPDATE",
        [environment, razorpayRefundId]
      );
      return res.rows.length ? mapPgRefund(res.rows[0]) : null;
    },
    async upsertRefund(r) {
      await client.query(
        `INSERT INTO refunds (internal_refund_id, razorpay_refund_id, razorpay_payment_id, user_id, amount, currency, refund_status, environment, processed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (environment, razorpay_refund_id) DO UPDATE SET
           refund_status = EXCLUDED.refund_status,
           processed_at = COALESCE(EXCLUDED.processed_at, refunds.processed_at)`,
        [r.internalRefundId, r.razorpayRefundId, r.razorpayPaymentId, r.userId, r.amount, r.currency, r.refundStatus, r.environment, r.processedAt || null, r.createdAt]
      );
      return r;
    },
    async getTotalRefundedForPayment(environment, razorpayPaymentId) {
      const res = await client.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE environment = $1 AND razorpay_payment_id = $2 AND refund_status IN ('processed', 'created')",
        [environment, razorpayPaymentId]
      );
      return Number(res.rows[0]?.total || 0);
    },
    async getPaymentReceiptByPaymentId(environment, razorpayPaymentId) {
      const res = await client.query(
        "SELECT * FROM payment_receipts WHERE environment = $1 AND razorpay_payment_id = $2",
        [environment, razorpayPaymentId]
      );
      return res.rows.length ? mapPgReceipt(res.rows[0]) : null;
    },
    async upsertPaymentReceipt(rc) {
      await client.query(
        `INSERT INTO payment_receipts (receipt_id, user_id, razorpay_payment_id, razorpay_order_id, environment, plan_id, plan_name, amount, currency, customer_name, customer_email, payment_method, validity_start, validity_end, snapshot, animation_seen_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (environment, razorpay_payment_id) DO NOTHING`,
        [rc.receiptId, rc.userId, rc.razorpayPaymentId, rc.razorpayOrderId, rc.environment, rc.planId, rc.planName, rc.amount, rc.currency, rc.customerName || null, rc.customerEmail || null, rc.paymentMethod || null, rc.validityStart, rc.validityEnd, JSON.stringify(rc.snapshot || {}), rc.animationSeenAt || null, rc.createdAt]
      );
      return rc;
    },
    async getActiveFulfilledPaymentsForUser(environment, userId) {
      const res = await client.query(
        "SELECT * FROM payments WHERE environment = $1 AND user_id = $2 AND entitlement_status = 'fulfilled' ORDER BY created_at DESC",
        [environment, userId]
      );
      return res.rows.map(mapPgPayment);
    }
  };
}

function mapPgReceipt(r) {
  return {
    receiptId: r.receipt_id,
    userId: r.user_id,
    razorpayPaymentId: r.razorpay_payment_id,
    razorpayOrderId: r.razorpay_order_id,
    environment: r.environment,
    planId: r.plan_id,
    planName: r.plan_name,
    amount: Number(r.amount),
    currency: r.currency,
    customerName: r.customer_name || null,
    customerEmail: r.customer_email || null,
    paymentMethod: r.payment_method || null,
    validityStart: Number(r.validity_start),
    validityEnd: Number(r.validity_end),
    snapshot: r.snapshot || {},
    animationSeenAt: r.animation_seen_at ? Number(r.animation_seen_at) : null,
    createdAt: Number(r.created_at)
  };
}

// ── Non-Production In-Memory Transactional Store (for automated tests without PG) ──
const memPaymentStore = {
  orders: new Map(),
  payments: new Map(),
  webhooks: new Map(),
  entitlements: new Map(),
  refunds: new Map(),
  usageCounters: new Map(),
  usageOperations: new Map(),
  receipts: new Map(),
  adminAuditLogs: [],
  analyticsEvents: []
};

let memTxQueue = Promise.resolve();

async function runInMemoryTx(fn, dbApi) {
  const run = async () => {
    const snap = {
      orders: new Map(Array.from(memPaymentStore.orders.entries()).map(([k, v]) => [k, { ...v }])),
      payments: new Map(Array.from(memPaymentStore.payments.entries()).map(([k, v]) => [k, { ...v }])),
      webhooks: new Map(Array.from(memPaymentStore.webhooks.entries()).map(([k, v]) => [k, { ...v }])),
      entitlements: new Map(Array.from(memPaymentStore.entitlements.entries()).map(([k, v]) => [k, { ...v }])),
      refunds: new Map(Array.from(memPaymentStore.refunds.entries()).map(([k, v]) => [k, { ...v }])),
      receipts: new Map(Array.from(memPaymentStore.receipts.entries()).map(([k, v]) => [k, { ...v }]))
    };

    const tx = {
      async insertOrder(o) {
        const key = `${o.environment}:${o.razorpayOrderId}`;
        if (memPaymentStore.orders.has(key)) throw new Error("Duplicate razorpay_order_id");
        memPaymentStore.orders.set(key, { ...o });
        return { ...o };
      },
      async getOrderByRazorpayIdForUpdate(environment, razorpayOrderId) {
        const v = memPaymentStore.orders.get(`${environment}:${razorpayOrderId}`);
        return v ? { ...v } : null;
      },
      async updateOrderStatus(internalOrderId, status) {
        for (const [k, v] of memPaymentStore.orders.entries()) {
          if (v.internalOrderId === internalOrderId) {
            memPaymentStore.orders.set(k, { ...v, status, updatedAt: Date.now() });
          }
        }
      },
      async getPaymentByRazorpayIdForUpdate(environment, razorpayPaymentId) {
        const v = memPaymentStore.payments.get(`${environment}:${razorpayPaymentId}`);
        return v ? { ...v } : null;
      },
      async upsertPayment(p) {
        const key = `${p.environment}:${p.razorpayPaymentId}`;
        const existing = memPaymentStore.payments.get(key);
        memPaymentStore.payments.set(key, existing ? { ...existing, ...p } : { ...p });
        return { ...p };
      },
      async getEntitlementForUpdate(userId, environment = "live") {
        const v = memPaymentStore.entitlements.get(`${userId}:${environment}`);
        return v ? { ...v } : null;
      },
      async upsertEntitlement(e) {
        memPaymentStore.entitlements.set(`${e.userId}:${e.environment}`, { ...e });
        return { ...e };
      },
      async updateUserTier(userId, tier) {
        await dbApi.updateUserTier(userId, tier);
      },
      async getWebhookEventForUpdate(environment, eventId) {
        const v = memPaymentStore.webhooks.get(`${environment}:${eventId}`);
        return v ? { ...v } : null;
      },
      async upsertWebhookEvent(w) {
        const key = `${w.environment}:${w.eventId}`;
        const existing = memPaymentStore.webhooks.get(key);
        memPaymentStore.webhooks.set(key, {
          ...w,
          attempts: existing ? existing.attempts + 1 : (w.attempts || 1)
        });
        return { ...w };
      },
      async getRefundByRazorpayIdForUpdate(environment, razorpayRefundId) {
        const v = memPaymentStore.refunds.get(`${environment}:${razorpayRefundId}`);
        return v ? { ...v } : null;
      },
      async upsertRefund(r) {
        const key = `${r.environment}:${r.razorpayRefundId}`;
        const existing = memPaymentStore.refunds.get(key);
        memPaymentStore.refunds.set(key, existing ? { ...existing, ...r } : { ...r });
        return { ...r };
      },
      async getTotalRefundedForPayment(environment, razorpayPaymentId) {
        let sum = 0;
        for (const r of memPaymentStore.refunds.values()) {
          if (r.environment === environment && r.razorpayPaymentId === razorpayPaymentId && (r.refundStatus === "processed" || r.refundStatus === "created")) {
            sum += Number(r.amount || 0);
          }
        }
        return sum;
      },
      async getActiveFulfilledPaymentsForUser(environment, userId) {
        return Array.from(memPaymentStore.payments.values())
          .filter(p => p.environment === environment && p.userId === userId && p.entitlementStatus === "fulfilled")
          .sort((a, b) => b.createdAt - a.createdAt);
      },
      async getPaymentReceiptByPaymentId(environment, razorpayPaymentId) {
        for (const r of memPaymentStore.receipts.values()) {
          if (r.environment === environment && r.razorpayPaymentId === razorpayPaymentId) return { ...r };
        }
        return null;
      },
      async upsertPaymentReceipt(rc) {
        const existing = Array.from(memPaymentStore.receipts.values()).find(
          r => r.environment === rc.environment && r.razorpayPaymentId === rc.razorpayPaymentId
        );
        if (!existing) {
          memPaymentStore.receipts.set(rc.receiptId, { ...rc });
        }
        return { ...rc };
      }
    };

    try {
      return await fn(tx);
    } catch (err) {
      memPaymentStore.orders = snap.orders;
      memPaymentStore.payments = snap.payments;
      memPaymentStore.webhooks = snap.webhooks;
      memPaymentStore.entitlements = snap.entitlements;
      memPaymentStore.refunds = snap.refunds;
      memPaymentStore.receipts = snap.receipts;
      throw err;
    }
  };

  const next = memTxQueue.then(run, run);
  memTxQueue = next.catch(() => {});
  return next;
}

