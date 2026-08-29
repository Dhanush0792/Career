// admin-shell.js -- Shared utilities for all JobXApply admin pages
// Loaded via <script src="admin-shell.js"> before any page-specific script.

const ADMIN_API = (typeof SYNC_API !== "undefined") ? SYNC_API : "https://jobxapply-backend.onrender.com/api";

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str || "");
  return div.innerHTML;
}

function adminToken() {
  return localStorage.getItem("jxa_token") || "";
}

async function adminFetch(path, options) {
  if (!options) options = {};
  var token = adminToken();
  var headers = Object.assign({ "Authorization": "Bearer " + token, "Content-Type": "application/json" }, options.headers || {});
  var res = await fetch(ADMIN_API + path, Object.assign({}, options, { headers: headers }));
  return res;
}

function showToast(msg, type) {
  if (!type) type = "success";
  var toast = document.getElementById("admin-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "admin-toast";
    toast.style.cssText = "position:fixed;bottom:28px;right:28px;z-index:99999;font-family:JetBrains Mono,monospace;font-size:12px;font-weight:700;padding:12px 20px;border:1px solid;max-width:360px;border-radius:8px;pointer-events:none;transition:opacity .3s,transform .3s;letter-spacing:.06em;";
    document.body.appendChild(toast);
  }
  var colors = {
    success: { bg: "rgba(47,221,196,.12)", border: "#2FDDC4", color: "#2FDDC4" },
    error:   { bg: "rgba(245,90,35,.12)", border: "#F55A23", color: "#F55A23" },
    info:    { bg: "rgba(245,166,35,.12)", border: "#F5A623", color: "#F5A623" }
  };
  var c = colors[type] || colors.info;
  toast.style.background = c.bg;
  toast.style.borderColor = c.border;
  toast.style.color = c.color;
  toast.style.backdropFilter = "blur(16px)";
  toast.textContent = msg;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  clearTimeout(toast._t);
  toast._t = setTimeout(function() { toast.style.opacity = "0"; toast.style.transform = "translateY(6px)"; }, 3500);
}

function renderAdminNav(activePage) {
  var pages = [
    { file: "index.html", label: "Overview" },
    { file: "users.html", label: "Users" },
    { file: "tools.html", label: "Tools" },
    { file: "content.html", label: "Content" },
    { file: "access.html", label: "Access" },
    { file: "reports.html", label: "Issues" },
    { file: "analytics.html", label: "Analytics" }
  ];
  var navEl = document.getElementById("admin-nav");
  if (!navEl) return;
  var links = pages.map(function(p) {
    var isActive = p.file === activePage;
    var activeStyle = isActive ? "background:rgba(245,166,35,0.1);border-radius:6px;" : "";
    var color = isActive ? "#F5A623" : "rgba(244,247,255,0.65)";
    return "<a href=\"" + p.file + "\" style=\"font-family:'JetBrains Mono',monospace;font-size:10px;color:" + color + ";padding:8px 14px;text-decoration:none;text-transform:uppercase;" + activeStyle + "white-space:nowrap;\">" + p.label + "</a>";
  }).join("");
  navEl.innerHTML = "<div style=\"max-width:1400px;margin:0 auto;padding:0 20px;width:100%;display:flex;align-items:center;gap:20px;\">" +
    "<a href=\"index.html\" style=\"font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#F5A623;text-decoration:none;white-space:nowrap;\">[JXA ADMIN]</a>" +
    "<div style=\"display:flex;gap:2px;flex:1;overflow-x:auto;\">" + links + "</div>" +
    "<a href=\"../dashboard.html\" style=\"font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(244,247,255,0.5);text-decoration:none;text-transform:uppercase;padding:8px 14px;white-space:nowrap;\">Back to App</a>" +
    "<button onclick=\"adminLogout()\" style=\"font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(244,247,255,0.45);border:1px solid rgba(255,255,255,0.15);padding:6px 14px;border-radius:8px;background:transparent;cursor:pointer;white-space:nowrap;\">Logout</button>" +
    "</div>";
}

function adminLogout() {
  Object.keys(localStorage).filter(function(k) { return k.startsWith("jxa_"); }).forEach(function(k) { localStorage.removeItem(k); });
  window.location.href = "../auth.html";
}

async function verifyAdminAccess(onSuccess) {
  var token = adminToken();
  if (!token) { window.location.href = "../auth.html"; return; }
  try {
    var res = await adminFetch("/profile");
    var data = await res.json();
    var role = data.role || (data.user && data.user.role);
    if (role !== "admin") {
      localStorage.removeItem("jxa_role");
      window.location.href = "../dashboard.html";
      return;
    }
    localStorage.setItem("jxa_role", "admin");
    if (typeof onSuccess === "function") onSuccess();
  } catch (e) {
    window.location.href = "../dashboard.html";
  }
}

function timeSince(tsMs) {
  if (!tsMs) return "Never";
  var diff = Date.now() - Number(tsMs);
  var m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return m + "m ago";
  var h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function fmtNum(n) {
  if (n === undefined || n === null || n === "--") return "--";
  return Number(n).toLocaleString();
}
