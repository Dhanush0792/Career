import { encryptProfileData, decryptProfileData, generatePasscodeHash } from "./shared.js";

const FIELDS = [
  "fullName", "firstName", "lastName", "email", "phone", "dob",
  "address", "city", "state", "country", "zip",
  "headline", "targetRole", "summary", "skills",
  "linkedin", "github", "portfolio",
  "experience", "education"
];

function setStatus(msg, cls = "") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = cls;
}

function readFields() {
  const p = {};
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) p[f] = el.value.trim();
  }
  return p;
}

function populateFields(p) {
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) el.value = p[f] || "";
  }
}

async function loadPasscode() {
  return new Promise((r) => chrome.storage.local.get(["jobxapplyPasscode"], (res) => r(res.jobxapplyPasscode || "")));
}

// ── Save locally ─────────────────────────────────────────────────────────────
async function saveLocal(profile) {
  const existing = await new Promise((r) =>
    chrome.storage.local.get(["jobxapplyProfiles", "jobxapplyActiveProfileId"], r)
  );
  const activeId = existing.jobxapplyActiveProfileId || "default";
  const profiles = existing.jobxapplyProfiles || {};
  profiles[activeId] = { ...profiles[activeId], ...profile, id: activeId, profileName: profile.fullName || "My Profile" };

  await new Promise((r) => chrome.storage.local.set({
    jobxapplyProfile: profile,
    jobxapplyProfiles: profiles,
    jobxapplyActiveProfileId: activeId
  }, r));
}

// ── Push to cloud ─────────────────────────────────────────────────────────────
async function pushToCloud(profile, passcode) {
  if (!passcode) {
    setStatus("Enter a passcode above to sync to cloud", "warn");
    return false;
  }
  await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: passcode }, r));
  const passcodeHash = await generatePasscodeHash(passcode);

  try {
    const encryptedProfile = await encryptProfileData(profile, passcode);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "jobxapply:setProfile", profile: encryptedProfile, passcodeHash },
        (res) => {
          if (chrome.runtime.lastError) {
            setStatus("Cloud sync failed — saved locally only", "warn");
            resolve(false);
            return;
          }
          if (res?.ok) {
            setStatus("✓ Saved and synced to cloud!", "ok");
            document.getElementById("conflictUI").style.display = "none";
            resolve(true);
          } else if (res?.conflict && res.current) {
            document.getElementById("conflictUI").style.display = "block";
            setStatus("Conflict detected — choose how to proceed", "warn");
            resolve(false);
          } else {
            // Server returned error but we already saved locally
            const errMsg = res?.error || res?.errors || "Server unavailable";
            setStatus(`Saved locally ✓ — Cloud sync failed: ${errMsg}`, "warn");
            resolve(false);
          }
        }
      );
    });
  } catch (err) {
    setStatus("Encryption error: " + err.message, "err");
    return false;
  }
}

// ── Fetch from cloud ─────────────────────────────────────────────────────────
async function fetchFromCloud(passcode) {
  if (!passcode) {
    setStatus("Enter your Sync Passcode first", "warn");
    return;
  }
  await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: passcode }, r));
  setStatus("Fetching from cloud…");

  chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
    if (chrome.runtime.lastError) {
      setStatus("Fetch error: " + chrome.runtime.lastError.message, "err");
      return;
    }
    const p = res?.profile;
    if (p && (p.fullName || p.email || p.phone)) {
      populateFields(p);
      // Also save locally
      await saveLocal(p);
      setStatus("✓ Profile fetched and loaded from cloud!", "ok");
    } else {
      setStatus("No profile found on server — check your passcode", "warn");
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  // Load local profile
  const local = await new Promise((r) =>
    chrome.storage.local.get(["jobxapplyProfile", "jobxapplyProfiles", "jobxapplyActiveProfileId"], r)
  );
  let profile = local.jobxapplyProfile || {};
  if (local.jobxapplyProfiles && local.jobxapplyActiveProfileId) {
    profile = local.jobxapplyProfiles[local.jobxapplyActiveProfileId] || profile;
  }
  populateFields(profile);

  // Load cached passcode
  const cachedPasscode = await loadPasscode();
  const passcodeEl = document.getElementById("syncPasscode");
  if (passcodeEl && cachedPasscode) passcodeEl.value = cachedPasscode;

  // Save Profile (local only)
  document.getElementById("save")?.addEventListener("click", async () => {
    const profile = readFields();
    setStatus("Saving…");
    try {
      await saveLocal(profile);
      setStatus("✓ Profile saved on this device!", "ok");
    } catch (e) {
      setStatus("Save failed: " + e.message, "err");
    }
  });

  // Save to Cloud
  document.getElementById("pushCloud")?.addEventListener("click", async () => {
    const profile = readFields();
    const passcode = passcodeEl?.value.trim() || "";
    setStatus("Saving locally first…");
    await saveLocal(profile);
    await pushToCloud(profile, passcode);
  });

  // Fetch from Cloud
  document.getElementById("pullCloud")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const passcode = passcodeEl?.value.trim() || "";
    await fetchFromCloud(passcode);
  });

  // Conflict resolution
  let pendingProfile = null;
  document.getElementById("conflictUseServer")?.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
      const passcode = passcodeEl?.value.trim() || "";
      let p = res?.profile || {};
      if (p.encryptedBlob && passcode) {
        try { p = await decryptProfileData(p, passcode); } catch (e) {}
      }
      populateFields(p);
      await saveLocal(p);
      document.getElementById("conflictUI").style.display = "none";
      setStatus("✓ Cloud version loaded. Review and save again if needed.", "ok");
    });
  });

  document.getElementById("conflictKeepLocal")?.addEventListener("click", async () => {
    const passcode = passcodeEl?.value.trim() || "";
    const profile = readFields();
    pendingProfile = profile;
    setStatus("Forcing local changes to cloud…");
    await pushToCloud(profile, passcode);
  });

  document.getElementById("conflictReload")?.addEventListener("click", () => {
    window.location.reload();
  });

  document.getElementById("close")?.addEventListener("click", () => window.close());
})();
