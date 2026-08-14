const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "..", "database", "jobxapply-sync-state.json");
const SCHEMA_FILE = path.join(__dirname, "..", "database", "profile-schema.json");
const MAPS_FILE = path.join(__dirname, "..", "database", "portal-maps.json");

const DEFAULT_PROFILE = {
  fullName: "",
  firstName: "",
  lastName: "",
  age: 0,
  dob: "",
  fatherName: "",
  motherName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "",
  zip: "",
  headline: "",
  summary: "",
  education: "",
  college: "",
  experience: "",
  skills: "",
  linkedin: "",
  github: "",
  portfolio: "",
  resumeDraft: "",
  targetRole: ""
};

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return normalizeState({
      profile: { ...DEFAULT_PROFILE },
      version: 0,
      updatedAt: 0,
      origin: "init"
    });
  }
}

function saveState(nextState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");
}

function normalizeProfile(profile = {}) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    if (profile[key] !== undefined) {
      const val = profile[key];
      if (typeof DEFAULT_PROFILE[key] === "number") {
        normalized[key] = Number.isFinite(Number(val)) ? Number(val) : DEFAULT_PROFILE[key];
      } else {
        normalized[key] = typeof val === "string" ? val.trim() : (val == null ? "" : String(val));
      }
    }
  }
  
  if (typeof profile.id === "string") normalized.id = profile.id;
  if (typeof profile.profileName === "string") normalized.profileName = profile.profileName;

  if (profile.encryptedBlob && typeof profile.encryptedBlob === "object") {
    normalized.encryptedBlob = {
      ciphertext: typeof profile.encryptedBlob.ciphertext === "string" ? profile.encryptedBlob.ciphertext : "",
      iv: typeof profile.encryptedBlob.iv === "string" ? profile.encryptedBlob.iv : "",
      salt: typeof profile.encryptedBlob.salt === "string" ? profile.encryptedBlob.salt : ""
    };
  }
  return normalized;
}

// Load AJV schema validator when available
let ajvValidate = null;
try {
  const Ajv = require("ajv");
  const schemaRaw = fs.readFileSync(SCHEMA_FILE, "utf8");
  const schema = JSON.parse(schemaRaw);
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajvValidate = ajv.compile(schema);
} catch (e) {
  ajvValidate = null;
}

// Load portal maps
let portalMaps = { version: 0, maps: {} };
function loadPortalMaps() {
  try {
    const raw = fs.readFileSync(MAPS_FILE, "utf8");
    portalMaps = JSON.parse(raw || "{}");
  } catch (e) {
    portalMaps = { version: 0, maps: {} };
  }
}
loadPortalMaps();

function normalizeState(candidate = {}) {
  let profiles = {};
  let activeProfileId = typeof candidate.activeProfileId === "string" ? candidate.activeProfileId : "default";

  if (candidate.profiles && typeof candidate.profiles === "object") {
    for (const key of Object.keys(candidate.profiles)) {
      const p = candidate.profiles[key] || {};
      profiles[key] = normalizeProfile(p);
      profiles[key].id = key;
      profiles[key].profileName = typeof p.profileName === "string" ? p.profileName : `Profile (${key})`;
    }
  } else {
    // Legacy single-profile migration
    const legacyProfile = normalizeProfile(candidate.profile || candidate);
    legacyProfile.id = "default";
    legacyProfile.profileName = "Default Profile";
    profiles = { "default": legacyProfile };
    activeProfileId = "default";
  }

  if (!profiles[activeProfileId]) {
    const keys = Object.keys(profiles);
    activeProfileId = keys.length ? keys[0] : "default";
  }

  if (Object.keys(profiles).length === 0) {
    profiles["default"] = {
      id: "default",
      profileName: "Default Profile",
      fullName: ""
    };
    activeProfileId = "default";
  }

  return {
    profiles,
    activeProfileId,
    profile: profiles[activeProfileId],
    passcodeHash: typeof candidate.passcodeHash === "string" ? candidate.passcodeHash : "",
    version: Number.isFinite(Number(candidate.version)) ? Number(candidate.version) : 0,
    updatedAt: Number.isFinite(Number(candidate.updatedAt)) ? Number(candidate.updatedAt) : 0,
    origin: typeof candidate.origin === "string" ? candidate.origin : "unknown"
  };
}

function validateProfile(profile) {
  const errors = [];
  if (!profile.fullName || String(profile.fullName).trim().length === 0) {
    errors.push("fullName is required");
  }
  if ((profile.fullName || "").length > 120) errors.push("fullName too long");
  if ((profile.headline || "").length > 160) errors.push("headline too long");
  if ((profile.targetRole || "").length > 160) errors.push("targetRole too long");

  if (!profile.encryptedBlob) {
    if ((profile.summary || "").length > 1200) errors.push("summary too long");
    if ((profile.location || "").length > 120) errors.push("location too long");
    if ((profile.portfolio || "").length > 280) errors.push("portfolio too long");
    if ((profile.resumeDraft || "").length > 20000) errors.push("resumeDraft too long");
    if (profile.email && String(profile.email).length > 280) errors.push("email too long");
    // run AJV validation to get structured errors when available
    if (ajvValidate) {
      const valid = ajvValidate(profile);
      if (!valid && Array.isArray(ajvValidate.errors)) {
        for (const err of ajvValidate.errors) {
          errors.push(`${err.instancePath || err.schemaPath || "profile"} ${err.message}`);
        }
      }
    }
  } else {
    const blob = profile.encryptedBlob;
    if (typeof blob.ciphertext !== "string" || !blob.ciphertext) errors.push("encryptedBlob.ciphertext must be a string");
    if (typeof blob.iv !== "string" || !blob.iv) errors.push("encryptedBlob.iv must be a string");
    if (typeof blob.salt !== "string" || !blob.salt) errors.push("encryptedBlob.salt must be a string");
  }
  return errors;
}

function validateState(nextState) {
  const errors = [];
  if (!nextState.profiles || typeof nextState.profiles !== "object" || Object.keys(nextState.profiles).length === 0) {
    errors.push("profiles must be a non-empty object");
    return errors;
  }
  if (typeof nextState.activeProfileId !== "string" || !nextState.activeProfileId) {
    errors.push("activeProfileId must be a non-empty string");
  } else if (!nextState.profiles[nextState.activeProfileId]) {
    errors.push(`activeProfileId '${nextState.activeProfileId}' not found in profiles`);
  }

  for (const key of Object.keys(nextState.profiles)) {
    const p = nextState.profiles[key];
    const pErrors = validateProfile(p);
    for (const err of pErrors) {
      errors.push(`Profile '${key}': ${err}`);
    }
  }
  return errors;
}

const db = require("./db");
const auth = require("./auth-handler");
const handleJobsSearch = require("./routes-jobs");

const clients = new Set(); // Set of objects: { userId, res }

function writeCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://") || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function getRequestUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  // Try JWT decode
  const decoded = auth.verifyToken(req);
  if (decoded) {
    return await db.getUserById(decoded.userId);
  }
  // Try passcode hash fallback
  return await db.getUserByPasscodeHash(token);
}

function sendJson(res, code, payload) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  const currentOrigin = res.getHeader("Access-Control-Allow-Origin");
  if (currentOrigin) {
    headers["Access-Control-Allow-Origin"] = currentOrigin;
    headers["Access-Control-Allow-Methods"] = res.getHeader("Access-Control-Allow-Methods") || "GET,POST,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = res.getHeader("Access-Control-Allow-Headers") || "Content-Type,Authorization";
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  res.writeHead(code, headers);
  res.end(JSON.stringify(payload));
}

function sendHtml(res, code, html) {
  res.writeHead(code, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function broadcast(userId, dataPayload, eventName = "profile") {
  const message = `event: ${eventName}\nid: ${dataPayload.version || Date.now()}\ndata: ${JSON.stringify(dataPayload)}\n\n`;
  for (const client of clients) {
    if (client.userId === userId) {
      try {
        client.res.write(message);
      } catch (e) {
        console.error("SSE write failed, removing client");
        clients.delete(client);
      }
    }
  }
}

function broadcastMaps(maps) {
  const message = `event: maps\nid: ${maps.version || 0}\ndata: ${JSON.stringify(maps)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(message);
    } catch (e) {
      clients.delete(client);
    }
  }
}

const server = http.createServer(async (req, res) => {
  writeCorsHeaders(req, res);

  // Increment apiRequests telemetry
  if (req.url && req.url.startsWith("/api/")) {
    db.recordTelemetryHit("apiRequests").catch(() => {});
  }

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // POST Telemetry Hit
  if (req.method === "POST" && urlObj.pathname === "/api/telemetry/hit") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const incoming = JSON.parse(body || "{}");
        const metric = incoming.metric || "pageViews";
        await db.recordTelemetryHit(metric);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  // Static Health check
  if (req.method === "GET" && urlObj.pathname === "/api/status") {
    const stats = await db.getStats();
    sendJson(res, 200, { ok: true, status: "online", users: stats.totalUsers, version: "1.2.0" });
    return;
  }

  // Authentication routes
  if (req.method === "POST" && urlObj.pathname === "/api/auth/register") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        await auth.registerUser(req, res, payload);
      } catch (e) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON format" });
      }
    });
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/auth/login") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        await auth.loginUser(req, res, payload);
      } catch (e) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON format" });
      }
    });
    return;
  }

  // Public Jobs Proxy Search
  if (req.method === "GET" && urlObj.pathname === "/api/jobs/search") {
    await handleJobsSearch(req, res, urlObj);
    return;
  }

  // Public extension download
  if (req.method === "GET" && urlObj.pathname === "/api/extension/download") {
    const zipPath = path.join(__dirname, "jobxapply-extension.zip");
    if (fs.existsSync(zipPath)) {
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=jobxapply-extension.zip"
      });
      fs.createReadStream(zipPath).pipe(res);
    } else {
      sendJson(res, 404, { ok: false, error: "Extension zip package not found" });
    }
    return;
  }

  // Public portal maps view
  if (req.method === "GET" && urlObj.pathname === "/api/maps") {
    sendJson(res, 200, portalMaps);
    return;
  }

  // Public broken field report submission
  if (req.method === "POST" && urlObj.pathname === "/api/report") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const entry = await db.createReport(payload);
        sendJson(res, 200, { ok: true, report: entry });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  // ── Protected Authenticated Routes ────────────────────────────────────────

  let activeUser = await getRequestUser(req);
  const usersList = await db.getUsersList();
  const isUninitialized = usersList.length === 0;

  let isUnauthProfileRequest = false;
  
  if (urlObj.pathname === "/api/profile" && req.method === "GET") {
    if (isUninitialized) {
      sendJson(res, 200, {
        profile: { fullName: "", email: "" },
        version: 0,
        updatedAt: Date.now()
      });
      return;
    }
    if (!activeUser && usersList.length > 0) {
      activeUser = usersList[0];
      isUnauthProfileRequest = true;
    }
  }

  if (isUninitialized && urlObj.pathname === "/api/profile" && req.method === "POST") {
    // Handled in POST /api/profile below
  } else if (!activeUser && urlObj.pathname.startsWith("/api/")) {
    if (urlObj.pathname !== "/api/events") {
      sendJson(res, 401, { ok: false, error: "Unauthorized access: Invalid or missing token" });
      return;
    }
  }

  // GET User Profile
  if (req.method === "GET" && urlObj.pathname === "/api/profile") {
    let profile = await db.getProfile(activeUser.id);
    if (profile) {
      if (isUnauthProfileRequest) {
        const activeId = profile.activeProfileId || "default";
        const activeProfile = profile.profile || (profile.profiles && profile.profiles[activeId]) || {};
        const { encryptedBlob, email, phone, address, city, state, country, zip, ...publicProfile } = activeProfile;
        
        sendJson(res, 200, {
          profile: publicProfile,
          version: profile.version || 1,
          updatedAt: profile.updatedAt || Date.now(),
          origin: profile.origin || "server"
        });
        return;
      }
      sendJson(res, 200, {
        profiles: profile.profiles,
        activeProfileId: profile.activeProfileId,
        profile: profile.profile,
        version: profile.version || 1,
        updatedAt: profile.updatedAt || Date.now(),
        origin: profile.origin || "server",
        tier: activeUser.tier || "free",
        role: activeUser.role || "user"
      });
    } else {
      sendJson(res, 200, {
        profile: { fullName: "", email: activeUser.email },
        version: 0,
        updatedAt: Date.now(),
        tier: activeUser.tier || "free",
        role: activeUser.role || "user"
      });
    }
    return;
  }

  // POST Update Profile
  if (req.method === "POST" && urlObj.pathname === "/api/profile") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const incoming = JSON.parse(body || "{}");
        
        const currentUsers = await db.getUsersList();
        if (currentUsers.length === 0) {
          if (!incoming.passcodeHash) {
            return sendJson(res, 400, { ok: false, error: "Passcode hash is required to initialize the server" });
          }
          const defaultUser = await db.createUser({
            email: "default@jobxapply.local",
            name: "Default Profile",
            passwordHash: ""
          });
          await db.updateUserPasscodeHash(defaultUser.id, incoming.passcodeHash);
          activeUser = defaultUser;
        }

        const stateData = normalizeState(incoming);
        stateData.version = (stateData.version || 0) + 1;
        stateData.updatedAt = Date.now();
        stateData.origin = incoming.origin || "server";

        const errors = validateState(stateData);
        if (errors.length) {
          return sendJson(res, 400, { ok: false, errors });
        }

        if (incoming.passcodeHash) {
          await db.updateUserPasscodeHash(activeUser.id, incoming.passcodeHash);
        }

        await db.saveProfile(activeUser.id, stateData);

        const responsePayload = {
          profiles: stateData.profiles,
          activeProfileId: stateData.activeProfileId,
          profile: stateData.profile,
          version: stateData.version,
          updatedAt: stateData.updatedAt,
          origin: stateData.origin
        };

        broadcast(activeUser.id, responsePayload);

        sendJson(res, 200, { ok: true, state: responsePayload });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
    });
    return;
  }

  // GET Applications Tracker
  if (req.method === "GET" && urlObj.pathname === "/api/tracker") {
    const apps = await db.getApplications(activeUser.id);
    sendJson(res, 200, { ok: true, applications: apps });
    return;
  }

  // POST Sync Applications Tracker
  if (req.method === "POST" && urlObj.pathname === "/api/tracker") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!Array.isArray(payload.applications)) {
          return sendJson(res, 400, { ok: false, error: "applications must be an array" });
        }
        await db.saveApplications(activeUser.id, payload.applications);
        broadcast(activeUser.id, payload.applications, "tracker");
        sendJson(res, 200, { ok: true, syncedCount: payload.applications.length });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  // SSE Stream Events
  if (req.method === "GET" && urlObj.pathname === "/api/events") {
    const token = urlObj.searchParams.get("token");
    let sseUser = null;
    if (token) {
      // Decode JWT
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        sseUser = await db.getUserById(decoded.userId);
      } catch (_) {
        // Fallback to passcode hash
        sseUser = await db.getUserByPasscodeHash(token);
      }
    }
    if (!sseUser) {
      sendJson(res, 401, { ok: false, error: "Unauthorized SSE subscription" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": res.getHeader("Access-Control-Allow-Origin") || "*"
    });
    res.write("\n");

    const clientWrapper = { userId: sseUser.id, res };
    clients.add(clientWrapper);

    req.on("close", () => {
      clients.delete(clientWrapper);
    });
    return;
  }

  // ── Admin-Only Routes ───────────────────────────────────────────────────

  if (urlObj.pathname.startsWith("/api/admin/") || urlObj.pathname === "/api/reports" || (urlObj.pathname === "/api/maps" && req.method === "POST")) {
    if (!activeUser || activeUser.role !== "admin") {
      sendJson(res, 403, { ok: false, error: "Forbidden: Admin privileges required" });
      return;
    }
  }

  // GET Admin Telemetry Stats
  if (req.method === "GET" && urlObj.pathname === "/api/admin/stats") {
    const stats = await db.getStats();
    sendJson(res, 200, { ok: true, stats });
    return;
  }

  // GET User List
  if (req.method === "GET" && urlObj.pathname === "/api/admin/users") {
    const users = await db.getUsersList();
    sendJson(res, 200, { ok: true, users });
    return;
  }

  // DELETE User / Update User Subscription Tier
  if (urlObj.pathname.startsWith("/api/admin/users/")) {
    const remainingPath = urlObj.pathname.substring("/api/admin/users/".length);
    
    // Check if it's tier update path: {userId}/tier
    if (remainingPath.endsWith("/tier")) {
      const userId = remainingPath.substring(0, remainingPath.lastIndexOf("/tier"));
      if (!userId) {
        sendJson(res, 400, { ok: false, error: "User ID is required" });
        return;
      }
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        try {
          const incoming = JSON.parse(body || "{}");
          const tier = incoming.tier || "free";
          const success = await db.updateUserTier(userId, tier);
          if (success) {
            sendJson(res, 200, { ok: true, message: `User ${userId} tier updated to ${tier}` });
          } else {
            sendJson(res, 404, { ok: false, error: "User not found" });
          }
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
      });
      return;
    }

    // Default to Delete User
    if (req.method === "DELETE") {
      const userIdToDelete = remainingPath;
      if (!userIdToDelete) {
        sendJson(res, 400, { ok: false, error: "User ID is required" });
        return;
      }
      await db.deleteUser(userIdToDelete);
      sendJson(res, 200, { ok: true, message: `User ${userIdToDelete} successfully deleted` });
    }
  }

  // GET Field Reports Queue
  if (req.method === "GET" && urlObj.pathname === "/api/reports") {
    const reports = await db.getReports();
    sendJson(res, 200, { ok: true, reports });
    return;
  }

  // POST Save live portal maps
  if (req.method === "POST" && urlObj.pathname === "/api/maps") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body || "{}");
        if (!incoming || typeof incoming !== "object") {
          sendJson(res, 400, { ok: false, error: "Invalid maps payload" });
          return;
        }
        fs.writeFileSync(MAPS_FILE, JSON.stringify(incoming, null, 2), "utf8");
        loadPortalMaps();
        broadcastMaps(portalMaps);
        sendJson(res, 200, { ok: true, maps: portalMaps });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`JobXApply sync server running on http://localhost:${PORT}`);
});
