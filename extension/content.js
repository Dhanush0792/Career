// Enhanced content script: heuristic field matching and floating autofill button

const FIELD_ALIASES = {
  fullname: ["fullname", "full name", "name"],
  firstname: ["first", "firstname", "given name"],
  lastname: ["last", "lastname", "surname", "family name"],
  age: ["age"],
  dob: ["dob", "date of birth", "birthdate", "birthday"],
  fathername: ["father's name", "father name", "guardian name", "father"],
  mothername: ["mother's name", "mother name", "mother"],
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
  let surrounding = "";
  const closestLabel = el.closest("label");
  if (closestLabel) {
    surrounding = normalize(closestLabel.textContent);
  } else {
    const parent = el.parentElement;
    if (parent) {
      const fullText = normalize(parent.textContent || "");
      if (fullText.length < 150) {
        surrounding = fullText;
      }
    }
  }
  checks.push(surrounding);

  let maxScore = 0;
  const aliases = FIELD_ALIASES[key] || [];
  for (const a of aliases) {
    const needle = normalize(a);
    for (const c of checks) {
      if (!c) continue;
      let score = 0;
      if (c === needle) score = 10;
      else if (c.includes(needle)) score = 8;
      else if (needle.includes(c)) score = 6;
      
      if (score > maxScore) {
        maxScore = score;
      }
    }
  }
  return maxScore;
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
  const confidenceThreshold = 6; // Strict 60% minimum score threshold
  return bestScore >= confidenceThreshold ? best : null;
}

function setValue(el, value) {
  if (!el) return false;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    return true;
  }
  // Removed el.focus() to avoid rapid page scrolling/jittering during autofill
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
  const profileLower = {};
  for (const [k, v] of Object.entries(profile || {})) {
    profileLower[k.toLowerCase()] = v;
  }
  for (const field of fields) {
    const key = normalize(field).replace(/\s+/g, "");
    if (key === "resume") {
      payload[key] = profileLower["resumedraft"] || profileLower["resume"] || "";
    } else if (profileLower[key] !== undefined) {
      payload[key] = profileLower[key];
    } else {
      payload[key] = profile[field] || profile[key] || "";
    }
  }
  return { createdAt: new Date().toISOString(), source: "jobxapply-profile", fields, payload };
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
      chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, (res) => resolve(res));
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
  if (message?.type === "jobxapply:insertText") {
    try {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.contentEditable === "true")) {
        if (activeEl.contentEditable === "true") {
          activeEl.textContent = message.text;
        } else {
          activeEl.value = message.text;
        }
        activeEl.dispatchEvent(new Event("input", { bubbles: true }));
        activeEl.dispatchEvent(new Event("change", { bubbles: true }));
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "No focused field" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return true;
  }
  if (message?.type === "jobxapply:getPageText") {
    try {
      const clone = document.body.cloneNode(true);
      const removals = clone.querySelectorAll("script, style, head, iframe, noscript, svg, nav, footer, header");
      removals.forEach(el => el.remove());
      const cleanText = clone.innerText || clone.textContent || "";
      sendResponse({ ok: true, text: cleanText });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return true;
  }
  if (message?.type === "jobxapply:toggleMappingMode") {
    toggleMappingMode();
    sendResponse({ ok: true });
    return true;
  }
const QUESTION_BANK = {
  knockout: [
    "authorized to work", "legally authorized", "visa sponsorship", "require sponsorship", "willing to relocate", "relocate to", "working on-site", "on-site", "willing to work", "shift/weekend", "background check"
  ],
  compensation: [
    "expected salary", "current salary", "salary expectations", "expected ctc", "current ctc", "salary range"
  ],
  logistics: [
    "notice period", "available to start", "earliest start date", "willing to travel", "travel"
  ],
  eeo: [
    "gender", "disability", "disabled", "veteran status", "veteran", "race", "ethnicity", "demographic"
  ],
  essay: [
    "why do you want to work", "why should we hire you", "tell us about yourself", "describe your relevant experience", "looking for in your next role", "walk us through your background"
  ]
};

function identifyQuestionCategory(label) {
  const norm = normalize(label);
  for (const [category, keywords] of Object.entries(QUESTION_BANK)) {
    if (keywords.some(kw => norm.includes(kw))) {
      return category;
    }
  }
  return null;
}

function getElementLabelText(el) {
  if (!el) return "";
  const attrs = [
    el.getAttribute("aria-label"),
    el.getAttribute("placeholder"),
    el.getAttribute("name"),
    el.getAttribute("id")
  ].filter(Boolean).join(" ");
  
  let labelText = attrs;
  try {
    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for='${id}']`);
      if (label) labelText += " " + label.textContent;
    }
  } catch (e) {}
  
  const closestLabel = el.closest("label");
  if (closestLabel) {
    labelText += " " + closestLabel.textContent;
  } else if (el.parentElement) {
    labelText += " " + el.parentElement.textContent;
  }
  return labelText;
}

function showKnockoutSuggestion(el, value) {
  const rect = el.getBoundingClientRect();
  const tip = document.createElement("div");
  tip.className = "jxa-knockout-tip";
  tip.style.position = "absolute";
  tip.style.zIndex = "2147483647";
  tip.style.top = `${window.scrollY + rect.top - 32}px`;
  tip.style.left = `${window.scrollX + rect.left}px`;
  tip.style.background = "#fff";
  tip.style.color = "#000";
  tip.style.border = "1px solid #ff9800";
  tip.style.padding = "4px 8px";
  tip.style.borderRadius = "4px";
  tip.style.fontSize = "11px";
  tip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  tip.innerHTML = `Suggested: <strong>${value}</strong> <button style="background:#5b4fe8;color:#fff;border:none;padding:2px 6px;margin-left:6px;cursor:pointer;border-radius:2px;">Fill</button>`;
  
  tip.querySelector("button").addEventListener("click", () => {
    setValue(el, value);
    tip.remove();
  });
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 8000);
}

// Block auto submits if essay or knockout tips exist
document.addEventListener("submit", (e) => {
  if (document.querySelector(".jxa-knockout-tip")) {
    e.preventDefault();
    alert("Please review the knockout question confirmations before submitting.");
  }
}, true);

  if (message?.type === "jobxapply:applyAutofill") {
    const profile = message.profile || {};
    const payload = buildAutofillPayload(profile, message.fields || []);
    chrome.runtime.sendMessage({ type: "jobxapply:getPortalMap", url: location.href }, (resp) => {
      const portalMap = resp?.map || {};
      const results = [];
      for (const [field, value] of Object.entries(payload.payload || {})) {
        const mapSelector = portalMap[field] || portalMap[field.toLowerCase()];
        const el = (mapSelector ? document.querySelector(mapSelector) : null) || findBestElementForKey(field) || findBestElementForKey(field.toLowerCase()) || null;
        
        if (el) {
          const labelText = getElementLabelText(el);
          const category = identifyQuestionCategory(labelText);
          
          if (category === "knockout") {
            showKnockoutSuggestion(el, value);
            results.push({ field, status: "suggested", via: "knockout-rule" });
          } else if (category === "compensation") {
            const expected = profile.preferences?.expectedSalary || "";
            if (expected) {
              setValue(el, expected);
              results.push({ field, status: "filled", via: "compensation-rule" });
            } else {
              el.style.border = "1px solid #eb5757";
              results.push({ field, status: "empty-flagged", via: "compensation-rule" });
            }
          } else if (category === "logistics") {
            const empStatus = profile.preferences?.employmentStatus || "employed";
            let logisticsVal = value;
            if (empStatus === "student") {
              logisticsVal = "Immediate / Date-based (Graduation)";
            } else if (empStatus === "unemployed") {
              logisticsVal = "Immediate";
            } else if (profile.preferences?.noticePeriod) {
              logisticsVal = profile.preferences.noticePeriod;
            }
            setValue(el, logisticsVal);
            el.style.backgroundColor = "#ffffe0";
            el.style.border = "1px solid #ffeb3b";
            results.push({ field, status: "filled-review", via: "logistics-rule" });
          } else if (category === "eeo") {
            results.push({ field, status: "skipped", via: "eeo-rule" });
          } else if (category === "essay") {
            const draft = `As a professional with experience in ${profile.skills ? profile.skills.slice(0, 3).join(', ') : 'product development'}, I am highly interested in this role. My background aligns with your core requirements, and I am excited about the opportunity to add value to your team.`;
            setValue(el, draft);
            el.focus();
            el.style.outline = "2px solid #ffeb3b";
            results.push({ field, status: "drafted", via: "essay-rule" });
          } else {
            setValue(el, value);
            results.push({ field, status: "filled", via: "heuristic" });
          }
        } else {
          results.push({ field, status: "not-found" });
        }
      }
      sendResponse({ ok: true, payload, results });
    });
    return true;
  }
});

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

let mapperStyles = null;
function injectMapperStyles() {
  if (mapperStyles) return;
  mapperStyles = document.createElement("style");
  mapperStyles.textContent = `
    .jxa-mapper-hover {
      outline: 2px solid #5b4fe8 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
      box-shadow: 0 0 12px rgba(91, 79, 232, 0.4) !important;
    }
    .jxa-mapper-mapped {
      outline: 2px solid #2fddc4 !important;
      outline-offset: 2px !important;
      background-color: rgba(47, 221, 196, 0.04) !important;
      box-shadow: 0 0 8px rgba(47, 221, 196, 0.2) !important;
    }
  `;
  document.head.appendChild(mapperStyles);
}

function removeMapperStyles() {
  if (mapperStyles) {
    mapperStyles.remove();
    mapperStyles = null;
  }
}

function getUniqueSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  
  const path = [];
  let current = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    } else {
      let sibIndex = 0;
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName === current.tagName) sibIndex++;
        sib = sib.previousElementSibling;
      }
      selector += `:nth-of-type(${sibIndex + 1})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(" > ");
}

let mapperBanner = null;
let mapperModal = null;
let isMappingActive = false;

function showMapperBanner() {
  if (mapperBanner) return;
  mapperBanner = document.createElement("div");
  mapperBanner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: 48px;
    background: #0b1020; border-bottom: 2px solid #5b4fe8;
    color: #fff; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; z-index: 2147483647; font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  
  const labelDiv = document.createElement("div");
  labelDiv.innerHTML = `<span style="font-weight:700; color:#5b4fe8; margin-right:8px;">JobXApply</span> <span style="color: rgba(255,255,255,0.7)">// Visual Selector Mapper (Click fields to map them)</span>`;
  
  const exitBtn = document.createElement("button");
  exitBtn.textContent = "Exit Mapper";
  exitBtn.style.cssText = `
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px; color: #fff; padding: 6px 12px; cursor: pointer; font-size: 11px;
    font-weight: 600; font-family: inherit; transition: background 0.2s;
  `;
  exitBtn.addEventListener("mouseover", () => exitBtn.style.background = "rgba(255,255,255,0.15)");
  exitBtn.addEventListener("mouseout", () => exitBtn.style.background = "rgba(255,255,255,0.08)");
  exitBtn.addEventListener("click", () => toggleMappingMode(false));
  
  mapperBanner.appendChild(labelDiv);
  mapperBanner.appendChild(exitBtn);
  document.body.appendChild(mapperBanner);
  document.body.style.paddingTop = "48px";
}

function hideMapperBanner() {
  if (mapperBanner) {
    mapperBanner.remove();
    mapperBanner = null;
    document.body.style.paddingTop = "";
  }
}

const MAPPER_FIELDS = [
  "fullName", "firstName", "lastName", "age", "dob", "email", "phone",
  "address", "city", "state", "country", "zip", "headline", "summary",
  "education", "college", "experience", "skills", "linkedin", "github", "portfolio", "resume", "targetRole"
];

function showMappingModal(el, selector) {
  if (mapperModal) mapperModal.remove();
  
  mapperModal = document.createElement("div");
  mapperModal.style.cssText = `
    position: fixed; inset: 0; background: rgba(5,8,22,0.8);
    display: flex; align-items: center; justify-content: center;
    z-index: 2147483647; font-family: system-ui, -apple-system, sans-serif;
    backdrop-filter: blur(8px);
  `;
  
  const container = document.createElement("div");
  container.style.cssText = `
    background: #0b1020; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px; padding: 24px; width: 340px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    max-height: 80vh; display: flex; flex-direction: column;
  `;
  
  const title = document.createElement("div");
  title.textContent = "Map Input Field";
  title.style.cssText = "font-size: 14px; font-weight:700; color:#fff; margin-bottom: 4px; text-transform:uppercase;";
  
  const preview = document.createElement("div");
  preview.textContent = selector;
  preview.style.cssText = "font-size: 11px; color:rgba(255,255,255,0.5); font-family: monospace; word-break:break-all; margin-bottom: 16px;";
  
  const list = document.createElement("div");
  list.style.cssText = "overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:6px; padding-right:4px;";
  
  MAPPER_FIELDS.forEach(f => {
    const btn = document.createElement("button");
    btn.textContent = f;
    btn.style.cssText = `
      text-align: left; padding: 8px 12px; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: rgba(255,255,255,0.8);
      cursor: pointer; font-size: 12px; transition: background 0.15s, border-color 0.15s;
    `;
    btn.addEventListener("mouseover", () => {
      btn.style.background = "rgba(91,79,232,0.12)";
      btn.style.borderColor = "rgba(91,79,232,0.3)";
    });
    btn.addEventListener("mouseout", () => {
      btn.style.background = "rgba(255,255,255,0.04)";
      btn.style.borderColor = "rgba(255,255,255,0.08)";
    });
    btn.addEventListener("click", () => {
      const domain = getBaseDomain(window.location.hostname);
      chrome.runtime.sendMessage({
        type: "jobxapply:saveCustomMap",
        domain,
        field: f,
        selector
      }, () => {
        el.classList.add("jxa-mapper-mapped");
        showToastNotification(`Mapped field: ${f}`);
        mapperModal.remove();
        mapperModal = null;
      });
    });
    list.appendChild(btn);
  });
  
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = `
    margin-top: 12px; background: transparent; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px; color: #fff; padding: 8px; cursor: pointer; font-size: 12px;
  `;
  cancelBtn.addEventListener("click", () => {
    mapperModal.remove();
    mapperModal = null;
  });
  
  container.appendChild(title);
  container.appendChild(preview);
  container.appendChild(list);
  container.appendChild(cancelBtn);
  mapperModal.appendChild(container);
  document.body.appendChild(mapperModal);
}

function showToastNotification(text) {
  const toast = document.createElement("div");
  toast.textContent = text;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: #070a18;
    border: 1px solid #2fddc4; border-radius: 12px; padding: 12px 20px;
    color: #fff; font-family: sans-serif; font-size: 13px; z-index: 2147483647;
    box-shadow: 0 8px 24px rgba(47, 221, 196, 0.2); transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function toggleMappingMode(forceState) {
  isMappingActive = typeof forceState === "boolean" ? forceState : !isMappingActive;
  
  if (isMappingActive) {
    injectMapperStyles();
    showMapperBanner();
    highlightExistingMappedFields();
    
    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleFieldClick, true);
    showToastNotification("Visual Mapper Active. Click any field to map.");
  } else {
    hideMapperBanner();
    removeMapperStyles();
    if (mapperModal) {
      mapperModal.remove();
      mapperModal = null;
    }
    
    document.removeEventListener("mouseover", handleMouseOver, true);
    document.removeEventListener("mouseout", handleMouseOut, true);
    document.removeEventListener("click", handleFieldClick, true);
    
    document.querySelectorAll(".jxa-mapper-hover, .jxa-mapper-mapped").forEach(el => {
      el.classList.remove("jxa-mapper-hover", "jxa-mapper-mapped");
    });
  }
}

function handleMouseOver(e) {
  const t = e.target;
  if (t && t.matches && t.matches("input, select, textarea")) {
    e.preventDefault();
    e.stopPropagation();
    t.classList.add("jxa-mapper-hover");
  }
}

function handleMouseOut(e) {
  const t = e.target;
  if (t && t.matches && t.matches("input, select, textarea")) {
    t.classList.remove("jxa-mapper-hover");
  }
}

function handleFieldClick(e) {
  const t = e.target;
  if (t && t.matches && t.matches("input, select, textarea")) {
    e.preventDefault();
    e.stopPropagation();
    t.classList.remove("jxa-mapper-hover");
    
    const selector = getUniqueSelector(t);
    showMappingModal(t, selector);
  }
}

function highlightExistingMappedFields() {
  chrome.runtime.sendMessage({ type: "jobxapply:getPortalMap", url: location.href }, (resp) => {
    const map = resp?.map || {};
    for (const selector of Object.values(map)) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.classList.add("jxa-mapper-mapped");
        }
      } catch(e) {}
    }
  });
}
