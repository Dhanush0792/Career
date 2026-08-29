import { buildAutofillPayload, getPortalRule, PORTAL_MAPS } from "./shared.js";

// ── Status Helpers ──────────────────────────────────────────────────────────
function setStatus(msg, cls = "") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = "status " + cls;
}

function setLoginStatus(msg, cls = "") {
  const el = document.getElementById("loginStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status " + cls;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Tab Management ──────────────────────────────────────────────────────────
function setupTabs() {
  const tabBtns = document.querySelectorAll(".nav-tab");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.style.display = pane.id === targetId ? "flex" : "none";
      });

      if (targetId === "trackerTab") {
        loadTrackerMetadata();
      }
    });
  });
}

// ── Portal Detection ────────────────────────────────────────────────────────
async function loadPortalInfo() {
  const tab = await getActiveTab();
  const rule = getPortalRule(tab?.url || "");
  const nameEl = document.getElementById("portalName");
  const tierEl = document.getElementById("portalTier");
  const dotEl  = document.getElementById("portalDot");
  if (nameEl) nameEl.textContent = rule.portal || "Unknown Site";
  if (tierEl) tierEl.textContent = rule.notes ? `${rule.tier} · ${rule.notes}` : rule.tier || "";
  if (dotEl) {
    if (!rule.portal || rule.portal === "unknown") dotEl.classList.add("unknown");
    else dotEl.classList.remove("unknown");
  }
  return { tab, rule };
}

// ── Multi-Persona & Profile State ───────────────────────────────────────────
async function checkAuthState() {
  const local = await new Promise((r) =>
    chrome.storage.local.get(
      ["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyPasscode", "jobxapplyToken", "jobxapplyEmail"],
      r
    )
  );

  let profiles = local.jobxapplyProfiles || {};
  let activeId = local.jobxapplyActiveProfileId || Object.keys(profiles)[0] || "default";
  let profile = profiles[activeId] || local.jobxapplyProfile || {};

  const hasCredentials = !!(local.jobxapplyPasscode || local.jobxapplyToken);
  const hasData = profile && !!(profile.fullName || profile.email || profile.phone);

  const loginView = document.getElementById("loginView");
  const autofillView = document.getElementById("autofillView");
  const navTabs = document.getElementById("navTabs");

  if (hasCredentials || hasData) {
    if (loginView) loginView.style.display = "none";
    if (autofillView) autofillView.style.display = "flex";
    if (navTabs) navTabs.style.display = "flex";
    
    renderPersonaSelector(profiles, activeId);
    await loadAndDisplayProfile(profile, local.jobxapplyEmail);
    renderSnippets(profile);
  } else {
    if (autofillView) autofillView.style.display = "none";
    if (navTabs) navTabs.style.display = "none";
    if (loginView) loginView.style.display = "flex";
  }
}

function renderPersonaSelector(profiles, activeId) {
  const group = document.getElementById("personaGroup");
  const select = document.getElementById("personaSelect");
  if (!group || !select) return;

  const profileKeys = Object.keys(profiles);
  if (profileKeys.length <= 1) {
    group.style.display = "none";
    return;
  }

  group.style.display = "flex";
  select.innerHTML = "";

  profileKeys.forEach((key) => {
    const p = profiles[key] || {};
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = p.profileName || p.targetRole || p.fullName || key;
    if (key === activeId) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = async (e) => {
    const selectedKey = e.target.value;
    await new Promise((r) => chrome.storage.local.set({ jobxapplyActiveProfileId: selectedKey }, r));
    await checkAuthState();
    setStatus("Switched active persona", "success");
  };
}

async function loadAndDisplayProfile(cachedProfile = null, cachedEmail = "") {
  let profile = cachedProfile;
  if (!profile) {
    const local = await new Promise((r) =>
      chrome.storage.local.get(["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyEmail"], r)
    );
    let profiles = local.jobxapplyProfiles || {};
    let activeId = local.jobxapplyActiveProfileId || Object.keys(profiles)[0] || "default";
    profile = profiles[activeId] || local.jobxapplyProfile || {};
    cachedEmail = local.jobxapplyEmail || "";
  }

  const nameEl   = document.getElementById("profileName");
  const emailEl  = document.getElementById("profileEmail");
  const avatarEl = document.getElementById("profileAvatar");
  const applyBtn = document.getElementById("apply");

  const displayName = profile.fullName || (profile.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "") || "Connected User";
  const displayEmail = profile.email || cachedEmail || "Profile ready";

  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = displayEmail;
  if (avatarEl) avatarEl.textContent = (displayName[0] || "U").toUpperCase();
  if (applyBtn) applyBtn.disabled = false;
  setStatus("Profile connected — ready to autofill", "success");

  return profile;
}

// ── Snippets Library ────────────────────────────────────────────────────────
function renderSnippets(profile = {}) {
  const listEl = document.getElementById("snippetList");
  if (!listEl) return;

  listEl.innerHTML = "";

  const items = [
    { title: "LinkedIn Profile", val: profile.linkedin },
    { title: "GitHub Portfolio", val: profile.github },
    { title: "Portfolio Website", val: profile.portfolio || profile.website },
    { title: "Email Address", val: profile.email },
    { title: "Phone Number", val: profile.phone },
    { title: "Target Role", val: profile.targetRole || profile.role },
    { title: "Work Authorization", val: profile.workAuthorization || "Authorized to work in country without visa sponsorship" },
    { title: "Notice Period", val: profile.noticePeriod || "Available immediately / 2 weeks" },
    { title: "Expected Salary", val: profile.expectedSalary },
    { title: "Professional Bio", val: profile.summary || profile.bio || profile.coverLetterDraft }
  ].filter((item) => item.val && String(item.val).trim().length > 0);

  if (!items.length) {
    listEl.innerHTML = `<div style="font-size:11px; color:rgba(244,247,255,0.4); text-align:center; padding:16px 0;">No snippets found. Fill in your profile details to populate.</div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "snippet-item";
    row.innerHTML = `
      <div class="snippet-header">
        <span class="snippet-title">${item.title}</span>
        <span class="snippet-action">Copy & Paste</span>
      </div>
      <div class="snippet-val">${item.val}</div>
    `;

    row.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.val);
        const tab = await getActiveTab();
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: "jobxapply:insertText", text: item.val });
        }
        setStatus(`Copied & inserted ${item.title}`, "success");
      } catch (err) {
        setStatus("Copied to clipboard", "success");
      }
    });

    listEl.appendChild(row);
  });
}

// ── Application Tracker Logger ──────────────────────────────────────────────
async function loadTrackerMetadata() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const companyInput = document.getElementById("trackerCompanyInput");
  const roleInput = document.getElementById("trackerRoleInput");

  chrome.tabs.sendMessage(tab.id, { type: "jobxapply:getJobMetadata" }, (res) => {
    if (res?.ok && res.metadata) {
      if (companyInput && !companyInput.value) companyInput.value = res.metadata.company || "";
      if (roleInput && !roleInput.value) roleInput.value = res.metadata.title || "";
    }
  });
}

async function logApplication(companyName = "", jobTitle = "", appStatus = "Applied") {
  const tab = await getActiveTab();
  const rule = getPortalRule(tab?.url || "");

  let company = companyName;
  let title = jobTitle;

  if (!company || !title) {
    // Attempt auto-extraction
    const meta = await new Promise((r) => {
      if (!tab?.id) return r(null);
      chrome.tabs.sendMessage(tab.id, { type: "jobxapply:getJobMetadata" }, (res) => r(res?.metadata || null));
    });
    if (meta) {
      if (!company) company = meta.company || rule.portal || "Unknown Company";
      if (!title) title = meta.title || "Job Application";
    }
  }

  company = company || rule.portal || "Application";
  title = title || "Position";

  const newApp = {
    id: "app_" + Date.now(),
    company: company,
    role: title,
    portal: rule.portal || "Web Portal",
    url: tab?.url || "",
    status: appStatus,
    appliedDate: new Date().toISOString().split("T")[0],
    notes: "Logged via JobXApply extension"
  };

  const stored = await new Promise((r) => chrome.storage.local.get(["jobxapplyApplications"], r));
  const apps = stored.jobxapplyApplications || [];
  apps.unshift(newApp);
  await new Promise((r) => chrome.storage.local.set({ jobxapplyApplications: apps }, r));

  // Sync to server if token available
  const auth = await new Promise((r) => chrome.storage.local.get(["jobxapplyToken"], r));
  if (auth.jobxapplyToken) {
    fetch("https://jobxapply-backend.onrender.com/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.jobxapplyToken}`
      },
      body: JSON.stringify(newApp)
    }).catch(() => {});
  }

  setStatus(`Logged application for ${company}`, "success");
}

// ── Direct Login with Sync Key ───────────────────────────────────────────────
async function handleDirectLogin() {
  const input = document.getElementById("loginPasscodeInput");
  const passcode = input?.value?.trim() || "";
  if (!passcode) {
    setLoginStatus("Please enter your Sync Key (Passcode)", "warn");
    return;
  }

  setLoginStatus("Connecting and decrypting profile...", "warn");
  await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: passcode }, r));

  chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
    if (chrome.runtime.lastError) {
      setLoginStatus("Sync error: " + chrome.runtime.lastError.message, "error");
      return;
    }

    if (res?.profile && (res.profile.fullName || res.profile.email)) {
      setLoginStatus("Authenticated & synced!", "success");
      await checkAuthState();
    } else if (res?.ok) {
      setLoginStatus("Authenticated! Loading profile...", "success");
      await checkAuthState();
    } else {
      setLoginStatus(res?.error || "Could not decrypt profile with that key.", "error");
    }
  });
}

// ── Google Web Login ────────────────────────────────────────────────────────
function handleGoogleWebLogin() {
  const webAuthUrl = "https://jobxapply-backend.onrender.com/auth.html";
  chrome.tabs.create({ url: webAuthUrl });
  setLoginStatus("Sign in with Google on the opened tab to sync.", "warn");
}

// ── Logout / Disconnect ─────────────────────────────────────────────────────
async function handleDisconnect() {
  if (!confirm("Log out from the extension and remove cached profile data?")) return;

  await new Promise((r) =>
    chrome.storage.local.remove(
      ["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyPasscode", "jobxapplyToken", "jobxapplyEmail"],
      r
    )
  );

  setLoginStatus("Disconnected from JobXApply.", "warn");
  const input = document.getElementById("loginPasscodeInput");
  if (input) input.value = "";

  await checkAuthState();
}

function getBaseDomain(hostname) {
  const parts = hostname.replace("www.", "").split(".");
  if (parts.length > 2) {
    const pen = parts[parts.length - 2];
    if (["co", "com", "net", "org", "gov", "edu"].includes(pen) && parts.length > 2) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  }
  return parts.join(".");
}

// ── Autofill ────────────────────────────────────────────────────────────────
async function doAutofill() {
  const { tab, rule } = await loadPortalInfo();
  if (!tab?.id) { setStatus("No active tab found", "error"); return; }

  const local = await new Promise((r) =>
    chrome.storage.local.get(["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId"], r)
  );
  let profiles = local.jobxapplyProfiles || {};
  let activeId = local.jobxapplyActiveProfileId || Object.keys(profiles)[0] || "default";
  let profile = profiles[activeId] || local.jobxapplyProfile || {};

  const hasData = profile && (profile.fullName || profile.email || profile.phone);
  if (!hasData) {
    setStatus("Profile is empty — sync your profile first!", "error");
    return;
  }

  setStatus("Running autofill…");
  const payload = buildAutofillPayload(profile, Object.keys(profile).filter(k => profile[k]));

  const mapData = await new Promise((r) => chrome.storage.local.get(["jobxapplyMaps", "jobxapplyCustomMaps"], r));
  const cached = mapData.jobxapplyMaps || null;
  let map = {};
  if (cached && cached.maps && cached.maps[rule.portal]) {
    map = { ...cached.maps[rule.portal] };
  } else if (cached && cached[rule.portal]) {
    map = { ...cached[rule.portal] };
  } else {
    map = { ...(PORTAL_MAPS[rule.portal] || {}) };
  }
  
  const customMaps = mapData.jobxapplyCustomMaps || {};
  try {
    const hostname = new URL(tab.url).hostname;
    const domain = getBaseDomain(hostname);
    if (customMaps[domain]) {
      map = { ...map, ...customMaps[domain] };
    }
  } catch (e) {}

  chrome.tabs.sendMessage(tab.id, { type: "jobxapply:applyAutofill", profile: payload, portalMap: map }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (res?.filled > 0) {
      setStatus(`Filled ${res.filled} field(s)`, "success");
    } else {
      setStatus("No matching fields found on this page", "warn");
    }
  });
}

// ── Sync from Cloud ──────────────────────────────────────────────────────────
async function syncFromCloud() {
  setStatus("Syncing from cloud…");
  chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
    if (chrome.runtime.lastError) {
      setStatus("Sync error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (res?.profile && (res.profile.fullName || res.profile.email)) {
      setStatus("Profile synced from cloud", "success");
      await checkAuthState();
    } else {
      setStatus("No profile found on server.", "warn");
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  setupTabs();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "jobxapply:profileUpdated") {
      checkAuthState();
    }
  });

  await loadPortalInfo();
  await checkAuthState();

  document.getElementById("loginPasscodeBtn")?.addEventListener("click", handleDirectLogin);
  document.getElementById("loginPasscodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleDirectLogin();
  });
  document.getElementById("loginGoogleBtn")?.addEventListener("click", handleGoogleWebLogin);

  document.getElementById("apply")?.addEventListener("click", doAutofill);
  document.getElementById("quickLogBtn")?.addEventListener("click", () => logApplication());
  
  document.getElementById("manualLogBtn")?.addEventListener("click", () => {
    const company = document.getElementById("trackerCompanyInput")?.value?.trim();
    const role = document.getElementById("trackerRoleInput")?.value?.trim();
    const status = document.getElementById("trackerStatusSelect")?.value || "Applied";
    logApplication(company, role, status);
  });

  document.getElementById("openTrackerBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://jobxapply-backend.onrender.com/tracker.html" });
  });

  document.getElementById("editProfile")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: chrome.runtime.getURL("profile.html") });
  });

  document.getElementById("syncCloud")?.addEventListener("click", syncFromCloud);
  document.getElementById("disconnectBtn")?.addEventListener("click", handleDisconnect);
})();
