const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const STATE_FILE = path.join(__dirname, "..", "database", "careerhub-sync-state.json");
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
    return {
      profile: { ...DEFAULT_PROFILE },
      version: 0,
      updatedAt: 0,
      origin: "init"
    };
  }
}

function saveState(nextState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");
}

function normalizeProfile(profile = {}) {
  const normalized = { ...DEFAULT_PROFILE };
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    const val = profile[key];
    if (typeof DEFAULT_PROFILE[key] === "number") {
      normalized[key] = Number.isFinite(Number(val)) ? Number(val) : DEFAULT_PROFILE[key];
    } else {
      normalized[key] = typeof val === "string" ? val.trim() : (val == null ? "" : String(val));
    }
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
  return {
    profile: normalizeProfile(candidate.profile || candidate),
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
  if ((profile.summary || "").length > 1200) errors.push("summary too long");
  if ((profile.location || "").length > 120) errors.push("location too long");
  if ((profile.portfolio || "").length > 280) errors.push("portfolio too long");
  if ((profile.resumeDraft || "").length > 20000) errors.push("resumeDraft too long");
  if ((profile.targetRole || "").length > 160) errors.push("targetRole too long");
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
  return errors;
}

let state = loadState();
const clients = new Set();

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, code, html) {
  res.writeHead(code, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function broadcast(event) {
  const data = `event: profile\nid: ${event.version}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

function broadcastMaps(maps) {
  const data = `event: maps\nid: ${maps.version || 0}\ndata: ${JSON.stringify(maps)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

function updateState(incoming, origin = "client") {
  const nextProfile = normalizeProfile(incoming.profile || incoming);
  const errors = validateProfile(nextProfile);
  if (errors.length) {
    return { ok: false, errors };
  }
  const nextVersion = Number.isFinite(Number(incoming.version)) ? Number(incoming.version) : 0;
  if (nextVersion && nextVersion < state.version) {
    return { ok: false, conflict: true, current: state };
  }
  state = {
    profile: nextProfile,
    version: Math.max(state.version, nextVersion) + 1,
    updatedAt: Date.now(),
    origin
  };
  saveState(state);
  broadcast(state);
  return { ok: true, state };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    sendHtml(res, 200, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CareerHub Sync Server</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, Segoe UI, sans-serif; background: #050816; color: #f4f8ff; }
      main { max-width: 1100px; margin: 0 auto; padding: 28px; display: grid; gap: 18px; }
      .hero { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 18px; }
      .card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 20px; box-shadow: 0 18px 40px rgba(0,0,0,.25); backdrop-filter: blur(18px); }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
      .row:last-child { border-bottom: 0; }
      .muted { color: rgba(244,248,255,.72); }
      .pill { display: inline-flex; padding: 4px 10px; border-radius: 999px; background: rgba(47,233,200,.14); color: #baf9ef; font-size: 12px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
      button { border: 0; border-radius: 12px; padding: 10px 14px; background: linear-gradient(135deg, #5b4fe8, #2ee9c8); color: white; cursor: pointer; }
      .hint { color: rgba(244,248,255,.66); line-height: 1.6; }
      h1, h2, h3, p { margin-top: 0; }
      @media (max-width: 900px) { .hero, .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <section class="card hero">
        <div>
          <div class="pill">Live Sync</div>
          <h1 style="margin-top:14px;font-size:clamp(2rem,5vw,3.6rem);letter-spacing:-0.05em;">CareerHub Sync Server</h1>
          <p class="hint">This page shows the actual shared state used by the frontend and extension. It updates from server events and a manual refresh.</p>
          <div class="row"><span>Profile API</span><span><code>/api/profile</code></span></div>
          <div class="row"><span>Event stream</span><span><code>/api/events</code></span></div>
          <div class="row"><span>Version</span><span id="version" class="pill">0</span></div>
        </div>
        <div class="card" style="background:rgba(255,255,255,.04);">
          <h2>Live Fields</h2>
          <div class="row"><span>Name</span><span id="fullName" class="muted">—</span></div>
          <div class="row"><span>Headline</span><span id="headline" class="muted">—</span></div>
          <div class="row"><span>Location</span><span id="location" class="muted">—</span></div>
          <div class="row"><span>Portfolio</span><span id="portfolio" class="muted">—</span></div>
        </div>
      </section>
      <section class="grid">
        <div class="card">
          <h2>More Fields</h2>
          <div class="row"><span>Target role</span><span id="targetRole" class="muted">—</span></div>
          <div class="row"><span>Summary</span><span id="summary" class="muted">—</span></div>
          <div class="row"><span>Resume draft</span><span id="resumeDraft" class="muted">—</span></div>
          <div class="row"><span>Updated</span><span id="updatedAt" class="muted">—</span></div>
        </div>
        <div class="card">
          <h2>Operations</h2>
          <p class="hint">This is the backend view of the same profile state. If the frontend or extension changes it, this card updates too.</p>
          <div class="row" style="align-items:center;">
            <span>Manual refresh</span>
            <button id="refresh">Refresh now</button>
          </div>
          <div class="row" style="align-items:center;">
            <span>Current origin</span>
            <span id="origin" class="pill">init</span>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>Raw State</h2>
        <pre id="rawState" class="muted">Loading…</pre>
      </section>
    </main>
    <script>
      const $ = (id) => document.getElementById(id);
      function render(state) {
        $("version").textContent = String(state?.version ?? 0);
        $("fullName").textContent = state?.profile?.fullName || "—";
        $("headline").textContent = state?.profile?.headline || "—";
        $("location").textContent = state?.profile?.location || "—";
        $("portfolio").textContent = state?.profile?.portfolio || "—";
        $("targetRole").textContent = state?.profile?.targetRole || "—";
        $("summary").textContent = state?.profile?.summary || "—";
        $("resumeDraft").textContent = state?.profile?.resumeDraft || "—";
        $("updatedAt").textContent = state?.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—";
        $("origin").textContent = state?.origin || "unknown";
        $("rawState").textContent = JSON.stringify(state, null, 2);
      }
      async function refresh() {
        const response = await fetch('/api/profile', { cache: 'no-store' });
        const state = await response.json();
        render(state);
      }
      $("refresh").addEventListener("click", refresh);
      const source = new EventSource('/api/events');
      source.addEventListener('profile', (event) => {
        render(JSON.parse(event.data));
      });
      refresh();
    </script>
  </body>
</html>`);
    return;
  }

  if (req.method === "GET" && req.url === "/maps-editor") {
    sendHtml(res, 200, `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Maps Editor</title>
<style>body{font-family:Inter,Segoe UI,Arial;margin:20px;background:#f6f8fb;color:#111}textarea{width:100%;height:60vh;font-family:monospace}</style>
</head>
<body>
<h1>Portal Maps Editor</h1>
<p>View and edit <code>database/portal-maps.json</code>. Save to push changes to the server.</p>
<textarea id="maps">Loading...</textarea>
<div style="margin-top:8px"><button id="save">Save maps</button> <span id="status"></span></div>
<script>
async function load(){ const r=await fetch('/api/maps'); const j=await r.json(); document.getElementById('maps').value=JSON.stringify(j, null, 2);} 
async function save(){ document.getElementById('status').textContent='Saving...'; const body=document.getElementById('maps').value; try{ const r=await fetch('/api/maps',{method:'POST',headers:{'Content-Type':'application/json'},body}); const j=await r.json(); if(r.ok){ document.getElementById('status').textContent='Saved'; } else { document.getElementById('status').textContent='Error: '+(j.error||'unknown'); } }catch(e){ document.getElementById('status').textContent='Error: '+e.message }
}
document.getElementById('save').addEventListener('click',save);
load();
</script>
</body>
</html>`);
    return;
  }

  if (req.method === "GET" && req.url === "/api/profile") {
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "GET" && req.url === "/api/maps") {
    // Serve the versioned portal maps
    sendJson(res, 200, portalMaps);
    return;
  }

  if (req.method === "POST" && req.url === "/api/maps") {
    // Replace maps file (simple admin endpoint for prototype)
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body || "{}");
        // basic shape check
        if (!incoming || typeof incoming !== 'object') {
          sendJson(res, 400, { ok: false, error: 'invalid maps payload' });
          return;
        }
        fs.writeFileSync(MAPS_FILE, JSON.stringify(incoming, null, 2), 'utf8');
        loadPortalMaps();
        broadcastMaps(portalMaps);
        sendJson(res, 200, { ok: true, maps: portalMaps });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/report") {
    // store simple map issue reports
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body || "{}");
        const reportFile = path.join(__dirname, "..", "database", "map-reports.json");
        let reports = [];
        try { reports = JSON.parse(fs.readFileSync(reportFile, 'utf8') || '[]'); } catch (e) { reports = []; }
        const entry = { id: Date.now(), createdAt: Date.now(), payload: incoming };
        reports.push(entry);
        fs.writeFileSync(reportFile, JSON.stringify(reports, null, 2), 'utf8');
        sendJson(res, 200, { ok: true, report: entry });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/profile") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body || "{}");
        const result = updateState(incoming, incoming.origin || "client");
        if (!result.ok) {
          if (result.conflict) {
            sendJson(res, 409, { ok: false, conflict: true, current: result.current });
            return;
          }
          sendJson(res, 400, { ok: false, errors: result.errors });
          return;
        }
        sendJson(res, 200, { ok: true, state: result.state });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`CareerHub sync server running on http://localhost:${PORT}`);
});
