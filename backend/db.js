const fs = require("fs");
const path = require("path");

const USERS_DIR = path.join(__dirname, "..", "database", "users");
const REPORTS_FILE = path.join(__dirname, "..", "database", "map-reports.json");
const USER_INDEX_FILE = path.join(__dirname, "..", "database", "user-registry.json");

// Ensure directories and files exist
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
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

// User helper
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
  return {
    profile: null,
    applications: []
  };
}

function saveUserData(userId, data) {
  const file = getUserFilePath(userId);
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`Error saving user data for ${userId}:`, e);
  }
}

// DB Interface Exports
module.exports = {
  // Authentication / Users
  async createUser({ email, name, passwordHash, role = "user" }) {
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
      createdAt: Date.now(),
      lastSync: Date.now()
    };
    registry.push(newUser);
    saveRegistry(registry);

    // Initialize user file data
    saveUserData(userId, { profile: null, applications: [] });
    return newUser;
  },

  async getUserByEmail(email) {
    const registry = loadRegistry();
    return registry.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserById(id) {
    const registry = loadRegistry();
    return registry.find(u => u.id === id) || null;
  },

  async getUserByPasscodeHash(passcodeHash) {
    if (!passcodeHash) return null;
    const registry = loadRegistry();
    return registry.find(u => u.passcodeHash === passcodeHash) || null;
  },

  async updateUserPasscodeHash(userId, passcodeHash) {
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
    const registry = loadRegistry();
    return registry.map(({ passwordHash, ...rest }) => rest);
  },

  async deleteUser(userId) {
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
    const data = loadUserData(userId);
    return data.profile;
  },

  async saveProfile(userId, profileData) {
    const data = loadUserData(userId);
    data.profile = profileData;
    saveUserData(userId, data);

    // Update last sync time
    const registry = loadRegistry();
    const user = registry.find(u => u.id === userId);
    if (user) {
      user.lastSync = Date.now();
      saveRegistry(registry);
    }
  },

  // Applications Tracker
  async getApplications(userId) {
    const data = loadUserData(userId);
    return data.applications || [];
  },

  async saveApplications(userId, applications) {
    const data = loadUserData(userId);
    data.applications = applications;
    saveUserData(userId, data);
  },

  // Reports Queue
  async createReport(report) {
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
    return loadReports();
  },

  async updateReportStatus(reportId, status) {
    const reports = loadReports();
    const report = reports.find(r => r.id === reportId);
    if (report) {
      report.status = status;
      saveReports(reports);
      return report;
    }
    return null;
  },

  // Telemetry Stats
  async getStats() {
    const registry = loadRegistry();
    const reports = loadReports();

    let totalApps = 0;
    let profilesCount = 0;

    registry.forEach(u => {
      const data = loadUserData(u.id);
      if (data.profile) profilesCount++;
      if (Array.isArray(data.applications)) totalApps += data.applications.length;
    });

    return {
      totalUsers: registry.length,
      totalProfiles: profilesCount,
      totalApplications: totalApps,
      totalReports: reports.length,
      pendingReports: reports.filter(r => r.status === "pending").length
    };
  }
};
