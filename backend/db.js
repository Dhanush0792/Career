const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const USERS_DIR = path.join(__dirname, "..", "database", "users");
const REPORTS_FILE = path.join(__dirname, "..", "database", "map-reports.json");
const USER_INDEX_FILE = path.join(__dirname, "..", "database", "user-registry.json");
const TELEMETRY_FILE = path.join(__dirname, "..", "database", "telemetry.json");

// Ensure directories exist
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

// MongoDB Client Initialization
let useMongo = false;
let mongoClient = null;
let dbInstance = null;

const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    mongoClient.connect()
      .then(client => {
        dbInstance = client.db();
        useMongo = true;
        console.log("[DB] Connection established: MongoDB Cloud Database is ACTIVE.");
      })
      .catch(err => {
        console.error("[DB] MongoDB connection failed. Falling back to local files.", err);
      });
  } catch (err) {
    console.error("[DB] Failed to construct MongoDB client. Falling back to local files.", err);
  }
}

async function getDb() {
  if (useMongo && dbInstance) return dbInstance;
  return null;
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
  } catch (e) {}
  return { pageViews: 0, apiRequests: 0 };
}

function saveTelemetry(data) {
  try {
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {}
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
    const db = await getDb();
    if (db) {
      const emailLower = email.toLowerCase();
      const existing = await db.collection("users").findOne({ email: emailLower });
      if (existing) {
        throw new Error("User already exists");
      }
      const userId = "u_" + Math.random().toString(36).substring(2, 15);
      const newUser = {
        id: userId,
        email: emailLower,
        name: name || "",
        passwordHash,
        role,
        tier: "free",
        createdAt: Date.now(),
        lastSync: Date.now()
      };
      await db.collection("users").insertOne(newUser);
      await db.collection("userdata").insertOne({ userId, profile: null, applications: [] });
      return newUser;
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
    const db = await getDb();
    if (db) {
      return await db.collection("users").findOne({ email: email.toLowerCase() });
    }

    const registry = loadRegistry();
    return registry.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserById(id) {
    const db = await getDb();
    if (db) {
      return await db.collection("users").findOne({ id: id });
    }

    const registry = loadRegistry();
    return registry.find(u => u.id === id) || null;
  },

  async getUserByPasscodeHash(passcodeHash) {
    if (!passcodeHash) return null;
    const db = await getDb();
    if (db) {
      return await db.collection("users").findOne({ passcodeHash: passcodeHash });
    }

    const registry = loadRegistry();
    return registry.find(u => u.passcodeHash === passcodeHash) || null;
  },

  async updateUserPasscodeHash(userId, passcodeHash) {
    const db = await getDb();
    if (db) {
      const res = await db.collection("users").updateOne({ id: userId }, { $set: { passcodeHash: passcodeHash } });
      return res.modifiedCount > 0;
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
    const db = await getDb();
    if (db) {
      const users = await db.collection("users").find({}).toArray();
      return users.map(({ passwordHash, _id, ...rest }) => rest);
    }

    const registry = loadRegistry();
    return registry.map(({ passwordHash, ...rest }) => rest);
  },

  async deleteUser(userId) {
    const db = await getDb();
    if (db) {
      await db.collection("users").deleteOne({ id: userId });
      await db.collection("userdata").deleteOne({ userId: userId });
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
    const db = await getDb();
    if (db) {
      const data = await db.collection("userdata").findOne({ userId: userId });
      return data ? data.profile : null;
    }

    const data = loadUserData(userId);
    return data.profile;
  },

  async saveProfile(userId, profileData) {
    const db = await getDb();
    if (db) {
      await db.collection("userdata").updateOne({ userId: userId }, { $set: { profile: profileData } }, { upsert: true });
      await db.collection("users").updateOne({ id: userId }, { $set: { lastSync: Date.now() } });
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
    const db = await getDb();
    if (db) {
      const data = await db.collection("userdata").findOne({ userId: userId });
      return data ? (data.applications || []) : [];
    }

    const data = loadUserData(userId);
    return data.applications || [];
  },

  async saveApplications(userId, applications) {
    const db = await getDb();
    if (db) {
      await db.collection("userdata").updateOne({ userId: userId }, { $set: { applications: applications } }, { upsert: true });
      return;
    }

    const data = loadUserData(userId);
    data.applications = applications;
    saveUserData(userId, data);
  },

  // Reports Queue
  async createReport(report) {
    const db = await getDb();
    if (db) {
      const newReport = {
        id: "rep_" + Math.random().toString(36).substring(2, 11),
        portal: report.portal,
        field: report.field,
        selectorTried: report.selectorTried,
        reporterEmail: report.reporterEmail || "anonymous",
        submittedAt: Date.now(),
        status: "pending"
      };
      await db.collection("reports").insertOne(newReport);
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
    const db = await getDb();
    if (db) {
      return await db.collection("reports").find({}).toArray();
    }

    return loadReports();
  },

  async updateReportStatus(reportId, status) {
    const db = await getDb();
    if (db) {
      const res = await db.collection("reports").findOneAndUpdate(
        { id: reportId },
        { $set: { status: status } },
        { returnDocument: "after" }
      );
      return res ? (res.value || res) : null;
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
    const db = await getDb();
    if (db) {
      const res = await db.collection("users").updateOne({ id: userId }, { $set: { tier: tier } });
      return res.modifiedCount > 0;
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
    const db = await getDb();
    if (db) {
      const update = {};
      update[metric] = 1;
      await db.collection("telemetry").updateOne({}, { $inc: update }, { upsert: true });
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
    const db = await getDb();
    if (db) {
      const totalUsers = await db.collection("users").countDocuments({});
      const totalReports = await db.collection("reports").countDocuments({});
      const pendingReports = await db.collection("reports").countDocuments({ status: "pending" });
      const tel = await db.collection("telemetry").findOne({}) || {};
      
      const freeUsers = await db.collection("users").countDocuments({ tier: { $nin: ["paid", "pro", "operative", "command"] } });
      const paidUsers = await db.collection("users").countDocuments({ tier: { $in: ["paid", "pro", "operative", "command"] } });

      const allUserData = await db.collection("userdata").find({}).toArray();
      let totalApps = 0;
      let profilesCount = 0;
      allUserData.forEach(d => {
        if (d.profile) profilesCount++;
        if (Array.isArray(d.applications)) totalApps += d.applications.length;
      });

      return {
        totalUsers,
        totalProfiles: profilesCount,
        totalApplications: totalApps,
        totalReports,
        pendingReports,
        freeUsers,
        paidUsers,
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
