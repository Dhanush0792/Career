import { buildAutofillPayload, getPortalRule } from "./shared.js";

const els = {
  portalName: document.getElementById("portalName"),
  portalTier: document.getElementById("portalTier"),
  fields: document.getElementById("fields"),
  notes: document.getElementById("notes"),
  apply: document.getElementById("apply"),
  editProfile: document.getElementById("editProfile"),
  report: document.getElementById("report"),
  status: document.getElementById("status"),
  payload: document.getElementById("payload"),
  toggleMapper: document.getElementById("toggleMapper"),
  captureSnapshot: document.getElementById("captureSnapshot"),
  snapshotPreview: document.getElementById("snapshotPreview"),
  removeSnapshot: document.getElementById("removeSnapshot"),
  logForm: document.getElementById("logForm"),
  logCompany: document.getElementById("logCompany"),
  logRole: document.getElementById("logRole"),
  logApp: document.getElementById("logApp")
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadPortalInfo() {
  const tab = await getActiveTab();
  const rule = getPortalRule(tab?.url || "");
  els.portalName.textContent = rule.portal;
  els.portalTier.textContent = `${rule.tier} · ${rule.notes}`;
  return { tab, rule };
}

let currentProfiles = {};
let currentActiveId = "";

async function loadProfile() {
  const response = await chrome.runtime.sendMessage({ type: "jobxapply:getProfile" });
  currentProfiles = response?.profiles || {};
  currentActiveId = response?.activeProfileId || "";
  return response?.profile || {};
}

async function populateProfileDropdown() {
  const select = document.getElementById("profileSelect");
  if (!select) return;

  const activeProfile = await loadProfile();
  select.innerHTML = "";
  for (const id of Object.keys(currentProfiles)) {
    const p = currentProfiles[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = p.profileName || id;
    if (id === currentActiveId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
}

async function refreshPreview() {
  const profile = await loadProfile();
  const requested = els.fields.value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const payload = buildAutofillPayload(profile, requested);
  if (els.notes.value.trim()) {
    payload.note = els.notes.value.trim();
  }
  els.payload.textContent = JSON.stringify(payload, null, 2);
  return payload;
}

document.getElementById("profileSelect").addEventListener("change", async (e) => {
  const newActiveId = e.target.value;
  if (!newActiveId) return;
  els.status.textContent = "Swapping profile...";
  const res = await chrome.runtime.sendMessage({
    type: "jobxapply:setActiveProfile",
    activeProfileId: newActiveId
  });
  if (res?.ok) {
    els.status.textContent = "Profile swapped.";
    await refreshPreview();
  } else {
    els.status.textContent = "Swap failed: " + (res?.error || "unknown");
  }
});

els.fields.addEventListener("input", refreshPreview);
els.notes.addEventListener("input", refreshPreview);

els.apply.addEventListener("click", async () => {
  const { tab } = await loadPortalInfo();
  const profile = await loadProfile();
  const requested = els.fields.value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "jobxapply:applyAutofill",
    profile,
    fields: requested
  });
  els.status.textContent = response?.ok
    ? `Applied ${response.results.filter((item) => item.status === "filled").length} fields`
    : "No response from page";
  els.payload.textContent = JSON.stringify(response?.payload || {}, null, 2);
});

els.editProfile.addEventListener("click", async () => {
  // open the extension profile editor page
  const url = chrome.runtime.getURL("profile.html");
  await chrome.tabs.create({ url });
});

els.report.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const rule = getPortalRule(tab?.url || "");
  const report = {
    url: tab?.url || "",
    title: tab?.title || "",
    portal: rule.portal,
    fields: els.fields.value,
    note: els.notes.value
  };
  const resp = await chrome.runtime.sendMessage({ type: "jobxapply:reportMapIssue", report });
  els.status.textContent = resp?.ok ? 'Reported map issue' : `Report failed: ${resp?.error || 'unknown'}`;
});

els.toggleMapper.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  await chrome.tabs.sendMessage(tab.id, { type: "jobxapply:toggleMappingMode" });
  window.close();
});

let currentSnapshotUrl = null;

function parseTitle(title, url) {
  let company = "";
  let role = "";
  
  if (url) {
    try {
      const host = new URL(url).hostname;
      const parts = host.split('.');
      if (parts.length > 1) {
        company = parts[parts.length - 2];
        if (company.toLowerCase() === 'co' && parts.length > 2) {
          company = parts[parts.length - 3];
        }
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    } catch(e) {}
  }
  
  if (title) {
    const splitters = [" - ", " | ", " at ", " @ "];
    for (const sp of splitters) {
      const index = title.indexOf(sp);
      if (index !== -1) {
        const part1 = title.substring(0, index).trim();
        const part2 = title.substring(index + sp.length).trim();
        if (part2.toLowerCase().includes("careers") || part2.toLowerCase().includes("jobs")) {
          role = part1;
        } else {
          role = part1;
          company = part2;
        }
        break;
      }
    }
    if (!role) {
      role = title.replace(/jobs/gi, '').replace(/careers/gi, '').trim();
    }
  }
  
  return {
    company: company || "Unknown Company",
    role: role || "Software Engineer"
  };
}

els.captureSnapshot.addEventListener("click", async () => {
  els.status.textContent = "Capturing screen...";
  const resp = await chrome.runtime.sendMessage({ type: "jobxapply:captureTab" });
  if (resp?.ok && resp.dataUrl) {
    currentSnapshotUrl = resp.dataUrl;
    els.snapshotPreview.style.backgroundImage = `url(${resp.dataUrl})`;
    els.snapshotPreview.style.display = "block";
    els.logForm.style.display = "flex";
    
    const tab = await getActiveTab();
    const info = parseTitle(tab.title || "", tab.url || "");
    els.logCompany.value = info.company;
    els.logRole.value = info.role;
    els.status.textContent = "Screen captured. Verify details below.";
  } else {
    els.status.textContent = `Capture failed: ${resp?.error || "unknown"}`;
  }
});

els.removeSnapshot.addEventListener("click", () => {
  currentSnapshotUrl = null;
  els.snapshotPreview.style.display = "none";
  els.logForm.style.display = "none";
  els.status.textContent = "Snapshot removed.";
});

els.logApp.addEventListener("click", async () => {
  const company = els.logCompany.value.trim();
  const role = els.logRole.value.trim();
  if (!company || !role) {
    els.status.textContent = "Company and role are required.";
    return;
  }
  
  els.logApp.disabled = true;
  els.status.textContent = "Saving application to tracker...";
  
  const tab = await getActiveTab();
  const rule = getPortalRule(tab?.url || "");
  
  const resp = await chrome.runtime.sendMessage({
    type: "jobxapply:logApplication",
    company,
    role,
    portal: rule.portal || "Direct",
    snapshot: currentSnapshotUrl
  });
  
  els.logApp.disabled = false;
  if (resp?.ok) {
    els.status.textContent = "Application logged successfully!";
    currentSnapshotUrl = null;
    els.snapshotPreview.style.display = "none";
    els.logForm.style.display = "none";
    els.logCompany.value = "";
    els.logRole.value = "";
  } else {
    els.status.textContent = `Save failed: ${resp?.error || "unknown"}`;
  }
});

await loadPortalInfo();
await populateProfileDropdown();
await refreshPreview();
