const fs = require("fs");
const path = require("path");
const http = require("https");

const JOBS_DB_FILE = path.join(__dirname, "jobs-db.json");

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function loadLocalJobs() {
  try {
    if (fs.existsSync(JOBS_DB_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_DB_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error reading jobs-db.json:", e);
  }
  return [];
}

// Fetch from Adzuna
function fetchAdzunaJobs(appId, appKey, what, where) {
  return new Promise((resolve, reject) => {
    // Adzuna API in India (in)
    const whatParam = what ? `&what=${encodeURIComponent(what)}` : "";
    const whereParam = where ? `&where=${encodeURIComponent(where)}` : "";
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=15${whatParam}${whereParam}&content-type=application/json`;

    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode === 200) {
            const parsed = JSON.parse(data);
            const results = (parsed.results || []).map((job, idx) => ({
              id: job.id || "adz_" + idx + "_" + Date.now(),
              title: job.title || "Software Developer",
              company: job.company?.display_name || "Tech Company",
              location: job.location?.display_name || "India",
              salary: job.salary_min && job.salary_max 
                ? `₹${job.salary_min.toLocaleString()} - ₹${job.salary_max.toLocaleString()}`
                : "Salary details undisclosed",
              description: job.description || "No description provided.",
              portal: "Adzuna",
              url: job.redirect_url || "http://localhost:3000/frontend/portals.html",
              postedAt: job.created ? new Date(job.created).toLocaleDateString() : "Recently"
            }));
            resolve(results);
          } else {
            reject(new Error(`Adzuna HTTP status ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", (e) => {
      reject(e);
    });
  });
}

module.exports = async function handleJobsSearch(req, res, urlObj) {
  const q = urlObj.searchParams.get("q") || "";
  const l = urlObj.searchParams.get("l") || "";

  require("dotenv").config();
  const adzunaAppId = process.env.ADZUNA_APP_ID;
  const adzunaAppKey = process.env.ADZUNA_APP_KEY;

  if (adzunaAppId && adzunaAppKey) {
    try {
      console.log(`Querying Adzuna for: what='${q}', where='${l}'`);
      const jobs = await fetchAdzunaJobs(adzunaAppId, adzunaAppKey, q, l);
      return sendJson(res, 200, { ok: true, jobs });
    } catch (err) {
      console.error("Adzuna fetch failed, falling back to local DB:", err.message);
    }
  }

  // Fallback / Default: Search local mock database
  const localJobs = loadLocalJobs();
  const filtered = localJobs.filter(job => {
    const qMatch = !q || 
      job.title.toLowerCase().includes(q.toLowerCase()) || 
      job.description.toLowerCase().includes(q.toLowerCase()) ||
      job.company.toLowerCase().includes(q.toLowerCase());
    
    const lMatch = !l || 
      job.location.toLowerCase().includes(l.toLowerCase());

    return qMatch && lMatch;
  });

  sendJson(res, 200, { ok: true, jobs: filtered, source: "local_database" });
};
