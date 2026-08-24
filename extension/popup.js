import { buildAutofillPayload, getPortalRule, PORTAL_MAPS } from "./shared.js";

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, cls = "") {
  const el = document.getElementById("status");
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

// ── Profile Loading ─────────────────────────────────────────────────────────
async function loadAndDisplayProfile() {
  // First try local storage for fast load
  const local = await new Promise((r) =>
    chrome.storage.local.get(["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId"], r)
  );

  let profile = local.jobxapplyProfile || {};
  // If profiles map exists, pick active one
  if (local.jobxapplyProfiles && local.jobxapplyActiveProfileId) {
    profile = local.jobxapplyProfiles[local.jobxapplyActiveProfileId] || profile;
  }

  const hasData = profile && (profile.fullName || profile.email || profile.phone);

  const nameEl   = document.getElementById("profileName");
  const emailEl  = document.getElementById("profileEmail");
  const avatarEl = document.getElementById("profileAvatar");
  const applyBtn = document.getElementById("apply");
  const banner   = document.getElementById("setupBanner");

  if (hasData) {
    if (nameEl)  nameEl.textContent  = profile.fullName || profile.firstName + " " + (profile.lastName || "") || "Profile Loaded";
    if (emailEl) emailEl.textContent = profile.email || profile.phone || "Ready to autofill";
    if (avatarEl) avatarEl.textContent = (profile.fullName || profile.firstName || "?")[0].toUpperCase();
    if (applyBtn) applyBtn.disabled = false;
    if (banner)  banner.style.display = "none";
    setStatus("Profile loaded — ready to autofill", "success");
  } else {
    if (nameEl)  nameEl.textContent  = "No profile loaded";
    if (emailEl) emailEl.textContent = "Set up your profile first";
    if (avatarEl) avatarEl.textContent = "?";
    if (applyBtn) applyBtn.disabled = true;
    if (banner)  banner.style.display = "block";
    setStatus("Profile not set up — click Edit Profile", "warn");
  }

  return profile;
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

  const profile = await loadAndDisplayProfile();
  const hasData = profile && (profile.fullName || profile.email || profile.phone);
  if (!hasData) {
    setStatus("Profile is empty — fetch from cloud first!", "error");
    return;
  }

  setStatus("Running autofill…");
  const payload = buildAutofillPayload(profile, Object.keys(profile).filter(k => profile[k]));

  // Resolve portal map in popup synchronously
  const local = await new Promise((r) => chrome.storage.local.get(["jobxapplyMaps", "jobxapplyCustomMaps"], r));
  const cached = local.jobxapplyMaps || null;
  let map = {};
  if (cached && cached.maps && cached.maps[rule.portal]) {
    map = { ...cached.maps[rule.portal] };
  } else if (cached && cached[rule.portal]) {
    map = { ...cached[rule.portal] };
  } else {
    map = { ...(PORTAL_MAPS[rule.portal] || {}) };
  }
  
  const customMaps = local.jobxapplyCustomMaps || {};
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
  const passcode = await new Promise((r) =>
    chrome.storage.local.get(["jobxapplyPasscode"], (res) => r(res.jobxapplyPasscode || ""))
  );

  if (!passcode) {
    // Ask for passcode inline
    const entered = prompt("Enter your Sync Passcode to fetch profile from cloud:");
    if (!entered) return;
    await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: entered }, r));
  }

  setStatus("Syncing from cloud…");
  chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
    if (chrome.runtime.lastError) {
      setStatus("Sync error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (res?.profile && (res.profile.fullName || res.profile.email)) {
      setStatus("✓ Profile synced from cloud!", "success");
      await loadAndDisplayProfile();
    } else {
      setStatus("No profile on server — enter profile manually", "warn");
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  await loadPortalInfo();
  await loadAndDisplayProfile();

  const toggle = document.getElementById("extensionToggle");
  if (toggle) {
    chrome.storage.local.get("extensionEnabled", (res) => {
      toggle.checked = res.extensionEnabled !== false;
    });
    toggle.addEventListener("change", (e) => {
      chrome.storage.local.set({ extensionEnabled: e.target.checked });
    });
  }

  document.getElementById("apply")?.addEventListener("click", doAutofill);

  document.getElementById("editProfile")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: chrome.runtime.getURL("profile.html") });
  });

  document.getElementById("syncCloud")?.addEventListener("click", syncFromCloud);
})();
