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
let pool = null;

const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Supabase external TLS queries
      }
    });
    pool.query("SELECT NOW()")
      .then(() => {
        usePg = true;
        console.log("[DB] Connection established: Supabase PostgreSQL Cloud DB is ACTIVE.");
      })
      .catch(err => {
        console.error("[DB] Supabase connection failed. Falling back to local files.", err);
      });
  } catch (err) {
    console.error("[DB] Failed to construct pg Pool. Falling back to local files.", err);
  }
}

// ─── Local Filesystem Utilities ──────────────────────────────────────────
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
  try {
    fs.writeFileSync(USER_INDEX_FILE, JSON.stringify(registry, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving user registry:", e);
  }
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
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving reports:", e);
  }
}

function loadTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      return JSON.parse(fs.readFileSync(TELEMETRY_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("Failed to load telemetry registry:", e);
  }
  return { pageViews: 0, apiRequests: 0 };
}

function saveTelemetry(data) {
  try {
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to save telemetry registry:", e);
  }
}

function getUserFilePath(userId) {
  return path.join(USERS_DIR, `${userId}.json`);
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
  const file = getUserFilePath(userId);
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`Error saving user data for ${userId}:`, e);
  }
}

// ─── DB Interface Exports ──────────────────────────────────────────────────
module.exports = {
  // Authentication / Users
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

  async getUsersList() {
    if (usePg) {
      const res = await pool.query("SELECT id, email, name, role, tier, created_at, last_sync, passcode_hash FROM users");
      return res.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        tier: u.tier,
        createdAt: Number(u.created_at),
        lastSync: Number(u.last_sync),
        passcodeHash: u.passcode_hash
      }));
    }

    const registry = loadRegistry();
    return registry.map(({ passwordHash, ...rest }) => rest);
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
        apiRequests: tel.apiRequests || 0
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
      apiRequests: tel.apiRequests || 0
    };
  }
};
