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
    var activeStyle = isActive ? "background:rgba(245,166,35,0.15);color:#F5A623;font-weight:600;" : "color:rgba(244,247,255,0.72);";
    return "<a href=\"" + p.file + "\" style=\"font-family:'Inter',sans-serif;font-size:13px;font-weight:500;padding:6px 12px;border-radius:8px;text-decoration:none;transition:all 0.15s ease;" + activeStyle + "white-space:nowrap;\">" + p.label + "</a>";
  }).join("");
  navEl.innerHTML = "<div style=\"max-width:1360px;margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;\">" +
    "<a href=\"index.html\" style=\"display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0;\">" +
      "<div style=\"width:32px;height:32px;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;\">" +
        "<img src=\"../assets/app-logo.png?v=6\" alt=\"JobXApply Logo\" style=\"width:100%;height:100%;object-fit:cover;\">" +
      "</div>" +
      "<span style=\"font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.01em;\">Job<span style=\"background:linear-gradient(135deg,#5B4FE8,#2FDDC4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;\">X</span>Apply <span style=\"font-size:11px;font-weight:600;color:#F5A623;padding:2px 8px;border-radius:12px;background:rgba(245,166,35,0.12);border:1px solid rgba(245,166,35,0.3);margin-left:4px;\">Admin</span></span>" +
    "</a>" +
    "<div style=\"display:flex;gap:4px;align-items:center;overflow-x:auto;scrollbar-width:none;\">" + links + "</div>" +
    "<div style=\"display:flex;align-items:center;gap:10px;flex-shrink:0;\">" +
      "<a href=\"../dashboard.html\" style=\"font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:rgba(244,247,255,0.65);border:1px solid rgba(255,255,255,0.12);padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.03);text-decoration:none;transition:all 0.15s ease;white-space:nowrap;\">Back to App</a>" +
      "<button onclick=\"adminLogout()\" style=\"font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:rgba(244,247,255,0.65);border:1px solid rgba(255,255,255,0.12);padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.03);cursor:pointer;transition:all 0.15s ease;white-space:nowrap;\">Logout</button>" +
    "</div>" +
    "</div>";
}

function adminLogout() {
  Object.keys(localStorage).filter(function(k) { return k.startsWith("jxa_"); }).forEach(function(k) { localStorage.removeItem(k); });
  window.location.href = "../auth.html";
}

async function verifyAdminAccess(onSuccess) {
  var token = adminToken();
  if (!token) {
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
    return;
  }
  var ADMIN_EMAILS = ['hidhanush07@gmail.com', 'dhanushsiddilingam@gmail.com', 'admin@jobxapply.app'];
  var userEmail = (localStorage.getItem('jxa_user_email') || '').toLowerCase().trim();
  var isAdminByEmail = ADMIN_EMAILS.includes(userEmail);

  try {
    var res = await adminFetch("/profile");
    if (res.ok) {
      var data = await res.json();
      var role = data.role || (data.user && data.user.role);
      if (role === "admin" || isAdminByEmail) {
        localStorage.setItem("jxa_role", "admin");
        if (typeof onSuccess === "function") onSuccess();
        return;
      }
    } else if (isAdminByEmail || localStorage.getItem('jxa_role') === 'admin') {
      // Backend temporarily unreachable or syncing, but client holds verified admin email/role
      if (typeof onSuccess === "function") onSuccess();
      return;
    }
    // Unauthorized
    localStorage.removeItem("jxa_role");
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
  } catch (e) {
    if (isAdminByEmail || localStorage.getItem('jxa_role') === 'admin') {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
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
