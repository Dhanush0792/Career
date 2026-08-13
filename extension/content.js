// Enhanced content script: heuristic field matching and floating autofill button

const FIELD_ALIASES = {
  fullname: ["fullname", "full name", "name"],
  firstname: ["first", "firstname", "given name"],
  lastname: ["last", "lastname", "surname", "family name"],
  age: ["age"],
  dob: ["dob", "date of birth", "birthdate", "birthday"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
  address: ["address", "street", "address1"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  country: ["country"],
  zip: ["zip", "postal", "postal code", "zipcode"],
  headline: ["headline", "title"],
  summary: ["summary", "about", "about me", "bio", "description"],
  education: ["education", "qualifications", "degree"],
  college: ["college", "university", "institution"],
  experience: ["experience", "work experience", "employment"],
  skills: ["skills", "skillset"],
  linkedin: ["linkedin", "linked in"],
  github: ["github", "git hub"],
  portfolio: ["portfolio", "website", "site"],
  resume: ["resume", "cv"],
  targetrole: ["role", "target role", "position", "designation"]
};

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function scoreElementForKey(el, key) {
  if (!el) return 0;
  const checks = [];
  const attrs = [el.getAttribute("aria-label"), el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("type")];
  for (const a of attrs) {
    checks.push(normalize(a));
  }
  // associated label text
  try {
    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for='${id}']`);
      if (label) checks.push(normalize(label.textContent));
    }
  } catch (e) {}
  const surrounding = normalize(el.closest("label")?.textContent || "") + " " + normalize(el.closest("div")?.innerText || "");
  checks.push(surrounding);

  const aliases = FIELD_ALIASES[key] || [];
  for (const a of aliases) {
    const needle = normalize(a);
    for (const c of checks) {
      if (!c) continue;
      if (c === needle) return 10;
      if (c.includes(needle)) return 8;
      if (needle.includes(c)) return 6;
    }
  }
  return 0;
}

function findBestElementForKey(key) {
  const candidates = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    const score = scoreElementForKey(el, key);
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function setValue(el, value) {
  if (!el) return false;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    return true;
  }
  try {
    el.focus();
  } catch (e) {}
  const tag = el.tagName?.toLowerCase();
  const type = normalize(el.getAttribute("type"));
  if (tag === "select") {
    // pick option that contains value
    for (const opt of Array.from(el.options || [])) {
      if (normalize(opt.text).includes(normalize(value)) || normalize(opt.value).includes(normalize(value))) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  }
  if (type === "checkbox" || type === "radio") {
    el.checked = Boolean(value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  try {
    el.value = value;
  } catch (e) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(el, value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function buildAutofillPayload(profile, requestedFields) {
  const fields = requestedFields && requestedFields.length ? requestedFields : Object.keys(profile || {});
  const payload = {};
  for (const field of fields) {
    const key = normalize(field).replace(/\s+/g, "");
    if (Object.prototype.hasOwnProperty.call(profile, key)) {
      payload[key] = profile[key];
    } else if (key === "resume") {
      payload[key] = profile.resumeDraft || "";
    } else {
      payload[key] = profile[field] || profile[key] || "";
    }
  }
  return { createdAt: new Date().toISOString(), source: "careerhub-profile", fields, payload };
}

// Floating autofill button shown near focused inputs
let autofillButton = null;
function createAutofillButton() {
  if (autofillButton) return autofillButton;
  autofillButton = document.createElement("button");
  autofillButton.textContent = "Autofill";
  autofillButton.style.position = "absolute";
  autofillButton.style.zIndex = 2147483647;
  autofillButton.style.padding = "6px 10px";
  autofillButton.style.borderRadius = "8px";
  autofillButton.style.background = "#5b4fe8";
  autofillButton.style.color = "#fff";
  autofillButton.style.border = "none";
  autofillButton.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  autofillButton.style.cursor = "pointer";
  autofillButton.style.fontSize = "12px";
  autofillButton.addEventListener("click", async (e) => {
    e.stopPropagation();
    const active = document.activeElement;
    if (!active) return;
    const key = guessKeyForElement(active);
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "careerhub:getProfile" }, (res) => resolve(res));
    });
    const profile = response?.profile || {};
    if (key) {
      const val = profile[key] || profile[key.toLowerCase()] || "";
      if (val) setValue(active, val);
    }
  });
  document.body.appendChild(autofillButton);
  return autofillButton;
}

function positionButtonNear(el) {
  if (!el) return;
  const btn = createAutofillButton();
  const rect = el.getBoundingClientRect();
  btn.style.top = `${window.scrollY + rect.top - 8}px`;
  btn.style.left = `${window.scrollX + rect.right + 8}px`;
  btn.style.display = "block";
}

function hideButton() {
  if (autofillButton) autofillButton.style.display = "none";
}

function guessKeyForElement(el) {
  // score each known alias and pick best
  const scores = {};
  for (const k of Object.keys(FIELD_ALIASES)) {
    scores[k] = scoreElementForKey(el, k);
  }
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length && entries[0][1] > 0) return entries[0][0];
  // fallback: use name/id
  const name = normalize(el.getAttribute("name") || el.getAttribute("id") || "").replace(/[^a-z0-9]/g, "");
  return name || null;
}

document.addEventListener("focusin", (e) => {
  const target = e.target;
  if (!target || !(target.matches && target.matches("input, textarea, [contenteditable='true'], select"))) {
    hideButton();
    return;
  }
  positionButtonNear(target);
});

document.addEventListener("click", (e) => {
  // hide when clicking away
  if (!(e.target && e.target === autofillButton)) hideButton();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "careerhub:applyAutofill") {
    const profile = message.profile || {};
    const payload = buildAutofillPayload(profile, message.fields || []);
    // ask background for portal-specific map
    chrome.runtime.sendMessage({ type: "careerhub:getPortalMap", url: location.href }, (resp) => {
      const portalMap = resp?.map || {};
      const results = [];
      for (const [field, value] of Object.entries(payload.payload || {})) {
        let filled = false;
        // check portal map first
        const mapSelector = portalMap[field] || portalMap[field.toLowerCase()];
        if (mapSelector) {
          try {
            const el = document.querySelector(mapSelector);
            if (el && setValue(el, value)) {
              results.push({ field, status: "filled", via: "map" });
              filled = true;
            }
          } catch (e) {
            // selector may be invalid, fall back
          }
        }
        if (!filled) {
          const el = findBestElementForKey(field) || findBestElementForKey(field.toLowerCase()) || null;
          if (el && setValue(el, value)) {
            results.push({ field, status: "filled", via: "heuristic" });
          } else {
            results.push({ field, status: "not-found" });
          }
        }
      }
      sendResponse({ ok: true, payload, results });
    });
    return true;
  }
});
