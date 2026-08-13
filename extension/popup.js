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
  payload: document.getElementById("payload")
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

async function loadProfile() {
  const response = await chrome.runtime.sendMessage({ type: "careerhub:getProfile" });
  return response?.profile || {};
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

els.fields.addEventListener("input", refreshPreview);
els.notes.addEventListener("input", refreshPreview);

els.apply.addEventListener("click", async () => {
  const { tab } = await loadPortalInfo();
  const profile = await loadProfile();
  const requested = els.fields.value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "careerhub:applyAutofill",
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
  const resp = await chrome.runtime.sendMessage({ type: "careerhub:reportMapIssue", report });
  els.status.textContent = resp?.ok ? 'Reported map issue' : `Report failed: ${resp?.error || 'unknown'}`;
});

await loadPortalInfo();
await refreshPreview();
