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

// ── Auth & Profile State ────────────────────────────────────────────────────
async function checkAuthState() {
  const local = await new Promise((r) =>
    chrome.storage.local.get(
      ["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyPasscode", "jobxapplyToken", "jobxapplyEmail"],
      r
    )
  );

  let profile = local.jobxapplyProfile || {};
  if (local.jobxapplyProfiles && local.jobxapplyActiveProfileId) {
    profile = local.jobxapplyProfiles[local.jobxapplyActiveProfileId] || profile;
  }

  const hasCredentials = !!(local.jobxapplyPasscode || local.jobxapplyToken);
  const hasData = profile && !!(profile.fullName || profile.email || profile.phone);

  const loginView = document.getElementById("loginView");
  const autofillView = document.getElementById("autofillView");

  if (hasCredentials || hasData) {
    if (loginView) loginView.style.display = "none";
    if (autofillView) autofillView.style.display = "flex";
    await loadAndDisplayProfile(profile, local.jobxapplyEmail);
  } else {
    if (autofillView) autofillView.style.display = "none";
    if (loginView) loginView.style.display = "flex";
  }
}

async function loadAndDisplayProfile(cachedProfile = null, cachedEmail = "") {
  let profile = cachedProfile;
  if (!profile) {
    const local = await new Promise((r) =>
      chrome.storage.local.get(["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyEmail"], r)
    );
    profile = local.jobxapplyProfile || {};
    if (local.jobxapplyProfiles && local.jobxapplyActiveProfileId) {
      profile = local.jobxapplyProfiles[local.jobxapplyActiveProfileId] || profile;
    }
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
      setLoginStatus("✓ Authenticated & synced!", "success");
      await checkAuthState();
    } else if (res?.ok) {
      setLoginStatus("✓ Authenticated! Loading profile...", "success");
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
  let profile = local.jobxapplyProfile || {};
  if (local.jobxapplyProfiles && local.jobxapplyActiveProfileId) {
    profile = local.jobxapplyProfiles[local.jobxapplyActiveProfileId] || profile;
  }

  const hasData = profile && (profile.fullName || profile.email || profile.phone);
  if (!hasData) {
    setStatus("Profile is empty — sync your profile first!", "error");
    return;
  }

  setStatus("Running autofill…");
  const payload = buildAutofillPayload(profile, Object.keys(profile).filter(k => profile[k]));

  // Resolve portal map in popup synchronously
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
      setStatus(`✓ Filled ${res.filled} field(s)`, "success");
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
      setStatus("✓ Profile synced from cloud!", "success");
      await checkAuthState();
    } else {
      setStatus("No profile found on server.", "warn");
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
(async function init() {
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
  document.getElementById("editProfile")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: chrome.runtime.getURL("profile.html") });
  });

  document.getElementById("syncCloud")?.addEventListener("click", syncFromCloud);
  document.getElementById("disconnectBtn")?.addEventListener("click", handleDisconnect);
})();
