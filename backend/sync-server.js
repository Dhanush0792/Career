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

  // GET Root Status Check
  if (req.method === "GET" && (urlObj.pathname === "/" || urlObj.pathname === "")) {
    sendJson(res, 200, { ok: true, message: "JobXApply Sync API Server is running. Access the user panel at http://localhost:8000" });
    return;
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

  // POST /api/ats/analyze
  if (req.method === "POST" && urlObj.pathname === "/api/ats/analyze") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const role = payload.role || "default";
        const jdText = payload.jdText || "";
        const profile = payload.profile || {};

        if (!jdText.trim()) {
          sendJson(res, 400, { ok: false, error: "Job description is required" });
          return;
        }

        // 1. Roles dictionary configuration
        const ROLE_PRESETS = {
          sde: {
            keywords: ["software engineering", "data structures", "algorithms", "git", "testing", "system design", "agile", "object-oriented"],
            skills: ["java", "javascript", "python", "c++", "sql", "html", "css"]
          },
          backend: {
            keywords: ["backend", "api design", "microservices", "databases", "rest", "scalability", "cloud computing", "docker", "security"],
            skills: ["node.js", "express", "sql", "postgresql", "mongodb", "aws", "redis", "python", "go"]
          },
          java: {
            keywords: ["java", "jvm", "spring boot", "maven", "gradle", "multithreading", "hibernate", "mvc", "microservices", "unit testing"],
            skills: ["java", "spring", "jpa", "sql", "junit", "git", "hibernate", "docker"]
          },
          marketing: {
            keywords: ["marketing", "analytics", "campaign management", "seo", "sem", "content strategy", "social media", "growth", "conversion"],
            skills: ["google analytics", "seo", "adwords", "hubspot", "crm", "content writing", "email marketing"]
          },
          sales: {
            keywords: ["sales", "business development", "crm", "negotiating", "lead generation", "pipeline management", "customer relationship", "closing"],
            skills: ["salesforce", "crm", "cold calling", "presentation", "negotiation", "hubspot"]
          },
          customer_care: {
            keywords: ["customer support", "communication", "ticketing", "troubleshooting", "crm", "query resolution", "escalation", "empathy"],
            skills: ["zendesk", "salesforce", "freshdesk", "live chat", "phone support", "problem solving"]
          },
          default: {
            keywords: ["professional", "communication", "organization", "problem solving", "management", "leadership", "collaboration"],
            skills: ["office", "excel", "word", "powerpoint", "slack", "zoom"]
          }
        };

        const preset = ROLE_PRESETS[role] || ROLE_PRESETS.default;
        const targetWords = [...preset.keywords, ...preset.skills];

        // Combine profile fields into a single text blob for full scanning
        const resumeText = [
          profile.fullName || "",
          profile.summary || "",
          profile.skills || "",
          profile.experience || "",
          profile.education || "",
          profile.projects || "",
          profile.certifications || "",
          profile.additional || ""
        ].join(" ").toLowerCase();

        // 2. Keyword Match (40%)
        const matchedKeywords = [];
        const missingKeywords = [];

        targetWords.forEach(word => {
          if (resumeText.includes(word.toLowerCase())) {
            matchedKeywords.push(word);
          } else {
            missingKeywords.push(word);
          }
        });

        const keywordScore = targetWords.length > 0 
          ? (matchedKeywords.length / targetWords.length) * 100 
          : 100;

        // 3. JD Alignment (40%)
        const stopWords = new Set([
          'the','and','or','to','a','an','in','for','of','with','is','are','be',
          'that','this','will','have','on','at','by','from','as','we','you','our',
          'their','it','not','your','can','all','more','about','if','been','use',
          'any','one','also','its','but','has','was','were','they','who','what',
          'when','how','into','than','then','so','up','out','them','these','those',
          'should','would','could','may','must','shall','do','does','did','get',
          'per','role','work','team','job','experience','position','company'
        ]);

        const jdTokens = jdText.toLowerCase()
          .replace(/[^a-z0-9\s.+#]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 1 && !stopWords.has(w));
        const jdSet = new Set(jdTokens);

        // Gather all candidate words
        const candidateTokens = resumeText
          .replace(/[^a-z0-9\s.+#]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 1 && !stopWords.has(w));
        
        let jdMatchedCount = 0;
        let jdTotalTerms = Array.from(jdSet).slice(0, 50); // Limit comparison to top 50 unique terms
        
        jdTotalTerms.forEach(term => {
          if (candidateTokens.includes(term)) {
            jdMatchedCount++;
          }
        });

        const jdAlignmentScore = jdTotalTerms.length > 0 
          ? (jdMatchedCount / jdTotalTerms.length) * 100 
          : 100;

        // 4. Section Completeness (20%)
        let completenessScore = 0;
        const completenessReport = [];

        if (profile.fullName && profile.fullName.trim()) { completenessScore += 15; } else { completenessReport.push("Missing Full Name profile header"); }
        if (profile.email && profile.email.trim()) { completenessScore += 15; } else { completenessReport.push("Missing email contact information"); }
        if (profile.summary && profile.summary.trim()) { completenessScore += 20; } else { completenessReport.push("Professional summary field is empty"); }
        if (profile.skills && profile.skills.trim()) { completenessScore += 20; } else { completenessReport.push("Technical skills inventory is empty"); }
        if (profile.experience && profile.experience.trim()) { completenessScore += 15; } else { completenessReport.push("No work experience entries populated"); }
        if (profile.education && profile.education.trim()) { completenessScore += 15; } else { completenessReport.push("No education qualifications listed"); }

        // Final score calculation
        const finalScore = Math.round(
          (keywordScore * 0.40) + 
          (jdAlignmentScore * 0.40) + 
          (completenessScore * 0.20)
        );

        // 5. Suggestions generation
        const suggestions = [];
        if (completenessReport.length > 0) {
          suggestions.push(`**Structural warnings**: Your profile is missing critical resume sections: ${completenessReport.join(", ")}.`);
        }
        if (missingKeywords.length > 0) {
          suggestions.push(`**Missing keywords**: Consider adding these industry-standard terms to your summary or skills list: ${missingKeywords.slice(0, 5).join(", ")}.`);
        }
        if (jdAlignmentScore < 50) {
          suggestions.push(`**Job description alignment**: Your vocabulary overlaps very little with this specific job description. Try adding terms like: "${jdTotalTerms.slice(0, 4).join('", "')}" to match their job description.`);
        }
        if (finalScore >= 80) {
          suggestions.push(`**Perfect layout & alignment**: Excellent compatibility! Your resume uses robust keyword mapping and exhibits complete structural integrity.`);
        } else if (finalScore >= 50) {
          suggestions.push(`**Needs optimization**: Good foundation. Include more role-specific tools in your skills list to cross the 80% compatibility bar.`);
        } else {
          suggestions.push(`**Critical revisions needed**: Align your resume keywords and summary with your target role preset to avoid auto-rejection by applicant trackers.`);
        }

        sendJson(res, 200, {
          ok: true,
          score: finalScore,
          matchedKeywords: matchedKeywords,
          missingKeywords: missingKeywords,
          suggestions: suggestions
        });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    });
    return;
  }

  // GET /api/resume/templates
  if (req.method === "GET" && urlObj.pathname === "/api/resume/templates") {
    const templates = [
      { id: "01", name: "Classic Chronological", file: "resume_01_classic_chronological.tex", desc: "Classic single-column professional layout, best for ATS-heavy applications.", safety: "Safe - Single Column" },
      { id: "02", name: "Sidebar Two-Column", file: "resume_02_sidebar_twocolumn.tex", desc: "Sleek split column layout with sidebar for contact/skills. Recommended for referrals.", safety: "Caution - Two Column" },
      { id: "03", name: "Compact Dense", file: "resume_03_compact_dense.tex", desc: "Space-saving dense single-column layout, ideal for students and freshers.", safety: "Safe - Single Column" },
      { id: "04", name: "Skills-First Functional", file: "resume_04_skills_first_functional.tex", desc: "Highlights professional skills and core competencies at the top.", safety: "Safe - Single Column" },
      { id: "05", name: "Timeline Style", file: "resume_05_timeline.tex", desc: "Chronological timeline layout with a vertical date-line divider.", safety: "Safe - Single Column" },
      { id: "06", name: "Academic CV", file: "resume_06_academic_cv.tex", desc: "Detailed layout suited for academic publications, research, and long CVs.", safety: "Safe - Single Column" },
      { id: "07", name: "Executive Minimalist", file: "resume_07_executive_minimalist.tex", desc: "Elegant minimalist presentation with generous whitespace and margin.", safety: "Safe - Single Column" },
      { id: "08", name: "Conservative Finance", file: "resume_08_conservative_finance.tex", desc: "Traditional layout using classic serif typography and compact headers.", safety: "Safe - Single Column" },
      { id: "09", name: "Modern Tech Sans", file: "resume_09_modern_tech_sans.tex", desc: "Modern clean layout with accent borders and sans-serif font face.", safety: "Safe - Single Column" },
      { id: "10", name: "Grid Modular Two-Column", file: "resume_10_grid_modular.tex", desc: "Structured grid layout with metadata column on the right.", safety: "Caution - Two Column" }
    ];
    sendJson(res, 200, templates);
    return;
  }

  // POST /api/resume/generate
  if (req.method === "POST" && urlObj.pathname === "/api/resume/generate") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const templateId = payload.templateId || "01";
        const data = payload.data || {};

        const templates = {
          "01": "resume_01_classic_chronological.tex",
          "02": "resume_02_sidebar_twocolumn.tex",
          "03": "resume_03_compact_dense.tex",
          "04": "resume_04_skills_first_functional.tex",
          "05": "resume_05_timeline.tex",
          "06": "resume_06_academic_cv.tex",
          "07": "resume_07_executive_minimalist.tex",
          "08": "resume_08_conservative_finance.tex",
          "09": "resume_09_modern_tech_sans.tex",
          "10": "resume_10_grid_modular.tex"
        };

        const fileName = templates[templateId] || templates["01"];
        const templatePath = path.join(__dirname, "templates", fileName);

        if (!fs.existsSync(templatePath)) {
          sendJson(res, 404, { ok: false, error: "Template file not found" });
          return;
        }

        let content = fs.readFileSync(templatePath, "utf8");

        // LaTeX Escaper
        const escapeLatex = (str) => {
          if (!str) return "";
          return String(str)
            .replace(/\\/g, "\\textbackslash{}")
            .replace(/([&%$#_{}])/g, "\\$1")
            .replace(/\^/g, "\\textasciicircum{}")
            .replace(/~/g, "\\textasciitilde{}")
            .replace(/</g, "\\textless{}")
            .replace(/>/g, "\\textgreater{}")
            .replace(/\n/g, " ");
        };

        // LaTeX Bullet Block Generator
        const formatBullets = (text) => {
          if (!text) return "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) return "";
          let output = "\\begin{itemize}\n";
          lines.forEach(l => {
            if (l.startsWith("-") || l.startsWith("*") || l.startsWith("•")) {
              output += `  \\item ${escapeLatex(l.substring(1).trim())}\n`;
            } else {
              output += `  \\item ${escapeLatex(l)}\n`;
            }
          });
          output += "\\end{itemize}";
          return output;
        };

        // LaTeX Experience Generator
        const formatExperience = (text) => {
          if (!text) return "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          let output = "";
          let inBullets = false;
          let bulletLines = [];

          const closeBullets = () => {
            if (inBullets && bulletLines.length > 0) {
              output += `\\begin{itemize}[leftmargin=0.2in]\n${bulletLines.map(l => `  \\item ${l}`).join('\n')}\n\\end{itemize}\n`;
              bulletLines = [];
              inBullets = false;
            }
          };

          lines.forEach(l => {
            if (l.startsWith("-") || l.startsWith("*") || l.startsWith("•")) {
              inBullets = true;
              bulletLines.push(escapeLatex(l.substring(1).trim()));
            } else {
              closeBullets();
              if (l.includes('--') || l.includes(' - ') || l.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|\d{4})/i)) {
                let parts = l.split(/  +/);
                if (parts.length < 2) parts = l.split('\t');
                if (parts.length >= 2) {
                  const title = escapeLatex(parts[0].trim());
                  const date = escapeLatex(parts[parts.length - 1].trim());
                  output += `\\begin{tabularx}{\\linewidth}{X r}\n\\textbf{${title}} & ${date} \\\\\n\\end{tabularx}\n`;
                } else {
                  output += `\\begin{tabularx}{\\linewidth}{X r}\n\\textbf{${escapeLatex(l)}} & \\\\\n\\end{tabularx}\n`;
                }
              } else {
                output += `\\noindent ${escapeLatex(l)} \\\\[4pt]\n`;
              }
            }
          });
          closeBullets();
          return output;
        };

        // LaTeX Timeline Experience Generator (Template 05)
        const formatExperienceTimeline = (text) => {
          if (!text) return "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          let output = "\\begin{tabular}{D!{\\vrule}C}\n";
          let inBullets = false;
          let bulletLines = [];

          const closeBullets = () => {
            if (inBullets && bulletLines.length > 0) {
              output += ` & \\begin{itemize}[leftmargin=0.15in]\n${bulletLines.map(l => `  \\item ${l}`).join('\n')}\n\\end{itemize} \\\\\n`;
              bulletLines = [];
              inBullets = false;
            }
          };

          lines.forEach(l => {
            if (l.startsWith("-") || l.startsWith("*") || l.startsWith("•")) {
              inBullets = true;
              bulletLines.push(escapeLatex(l.substring(1).trim()));
            } else {
              closeBullets();
              if (l.includes('--') || l.includes(' - ') || l.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|\d{4})/i)) {
                let parts = l.split(/  +/);
                if (parts.length < 2) parts = l.split('\t');
                if (parts.length >= 2) {
                  const title = escapeLatex(parts[0].trim());
                  const date = escapeLatex(parts[parts.length - 1].trim());
                  output += `${date} & \\textbf{${title}} \\\\\n`;
                } else {
                  output += ` & \\textbf{${escapeLatex(l)}} \\\\\n`;
                }
              } else {
                output += ` & ${escapeLatex(l)} \\\\[2pt]\n`;
              }
            }
          });
          closeBullets();
          output += "\\end{tabular}";
          return output;
        };

        // LaTeX Education Generator
        const formatEducation = (text) => {
          if (!text) return "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          let output = "\\begin{tabularx}{\\linewidth}{X r}\n";
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('--') || line.match(/(\d{4})/)) {
              let parts = line.split(/  +/);
              if (parts.length < 2) parts = line.split('\t');
              if (parts.length >= 2) {
                output += `\\textbf{${escapeLatex(parts[0].trim())}} & ${escapeLatex(parts[parts.length - 1].trim())} \\\\\n`;
              } else {
                output += `\\textbf{${escapeLatex(line)}} & \\\\\n`;
              }
            } else {
              output += `${escapeLatex(line)} \\\\[4pt]\n`;
            }
          }
          output += "\\end{tabularx}";
          return output;
        };

        // Substitute personal contact info
        content = content
          .replace(/\{\{FULL_NAME\}\}/g, escapeLatex(data.fullName || ""))
          .replace(/\{\{TARGET_ROLE_TITLE\}\}/g, escapeLatex(data.targetRole || ""))
          .replace(/\{\{EMAIL\}\}/g, escapeLatex(data.email || ""))
          .replace(/\{\{PHONE\}\}/g, escapeLatex(data.phone || ""))
          .replace(/\{\{LOCATION\}\}/g, escapeLatex(data.location || ""))
          .replace(/\{\{LINKEDIN_URL\}\}/g, escapeLatex(data.linkedinUrl || ""))
          .replace(/\{\{LINKEDIN_DISPLAY\}\}/g, escapeLatex(data.linkedinDisplay || ""))
          .replace(/\{\{GITHUB_URL\}\}/g, escapeLatex(data.githubUrl || ""))
          .replace(/\{\{GITHUB_DISPLAY\}\}/g, escapeLatex(data.githubDisplay || ""))
          .replace(/\{\{PORTFOLIO_URL\}\}/g, escapeLatex(data.portfolioUrl || ""))
          .replace(/\{\{PORTFOLIO_DISPLAY\}\}/g, escapeLatex(data.portfolioDisplay || ""))
          .replace(/\{\{SUMMARY\}\}/g, escapeLatex(data.summary || ""));

        // Substitute blocks
        const eduContent = formatEducation(data.education);
        const expContent = templateId === "05" ? formatExperienceTimeline(data.experience) : formatExperience(data.experience);
        const projContent = formatBullets(data.projects);
        const skillsContent = formatBullets(data.skills);
        const certsContent = formatBullets(data.certifications);
        const addContent = formatBullets(data.additional);

        content = content
          .replace(/\{\{EDUCATION_BLOCK\}\}/g, eduContent)
          .replace(/\{\{EXPERIENCE_BLOCK\}\}/g, expContent)
          .replace(/\{\{PROJECTS_BLOCK\}\}/g, projContent)
          .replace(/\{\{SKILLS_BLOCK\}\}/g, skillsContent)
          .replace(/\{\{CERTIFICATIONS_BLOCK\}\}/g, certsContent)
          .replace(/\{\{ADDITIONAL_BLOCK\}\}/g, addContent);

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(content);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`JobXApply sync server running on http://localhost:${PORT}`);
});
