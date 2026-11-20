import { buildAutofillPayload, getPortalRule, PORTAL_MAPS, generatePasscodeHash, decryptProfileData, encryptProfileData } from "./shared.js";
import { MOCK_PROFILE_DATA } from "./mock-profile-data.js";

// ── State ──────────────────────────────────────────────────────────────────
let activeProfile = {};
let allProfiles = {};
let activeProfileId = "default";
let applications = [];
let currentPortalRule = { portal: "unknown", tier: "Tier 3" };
let currentActiveTab = null;

// ── Utilities & Toast ──────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const el = document.getElementById("spToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Tab Navigation ─────────────────────────────────────────────────────────
function setupNavigation() {
  const navTabs = document.querySelectorAll(".sp-nav-tab");
  navTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.getAttribute("data-view");
      navTabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".sp-view").forEach((view) => {
        view.classList.toggle("active", view.id === targetView);
      });

      if (targetView === "dashboardView") updateDashboardUI();
      if (targetView === "trackerView") renderTrackerList();
    });
  });
}

// ── Live Portal Detection ──────────────────────────────────────────────────
async function updateActivePortalInfo() {
  try {
    currentActiveTab = await getActiveTab();
    const url = currentActiveTab?.url || "";
    currentPortalRule = getPortalRule(url);

    const nameEl = document.getElementById("spPortalName");
    const tierEl = document.getElementById("spPortalTier");
    const dotEl  = document.getElementById("spPortalDot");

    if (nameEl) {
      nameEl.textContent = currentPortalRule.portal !== "unknown" ? currentPortalRule.portal : "Universal Job Form";
    }
    if (tierEl) {
      tierEl.textContent = currentPortalRule.tier || "Active";
    }
    if (dotEl) {
      dotEl.className = currentPortalRule.portal !== "unknown" ? "sp-portal-dot" : "sp-portal-dot unknown";
    }
  } catch (e) {
    console.error("Portal detect error", e);
  }
}

// ── Profile Storage & Management ───────────────────────────────────────────
async function loadStoredProfiles() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyProfile", "jobxapplyPasscode"], (res) => {
      allProfiles = res.jobxapplyProfiles || {};
      activeProfileId = res.jobxapplyActiveProfileId || "default";

      if (allProfiles[activeProfileId]) {
        activeProfile = allProfiles[activeProfileId];
      } else if (res.jobxapplyProfile) {
        activeProfile = res.jobxapplyProfile;
        allProfiles[activeProfileId] = activeProfile;
      } else {
        activeProfile = { ...MOCK_PROFILE_DATA };
        allProfiles["default"] = activeProfile;
      }

      const passcodeEl = document.getElementById("setPasscode");
      if (passcodeEl && res.jobxapplyPasscode) {
        passcodeEl.value = res.jobxapplyPasscode;
      }

      populatePersonaDropdown();
      populateProfileForm();
      updateDashboardUI();
      resolve(activeProfile);
    });
  });
}

function populatePersonaDropdown() {
  const sel = document.getElementById("spPersonaSelect");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(allProfiles).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = allProfiles[id].profileName || allProfiles[id].fullName || id;
    if (id === activeProfileId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateProfileForm() {
  const p = activeProfile || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("profFullName", p.fullName);
  setVal("profEmail", p.email);
  setVal("profPhone", p.phone);
  setVal("profCity", p.city || (p.address ? `${p.address}, ${p.city || ""}` : ""));
  setVal("profLinkedIn", p.linkedin || p.linkedInUrl);
  setVal("profGitHub", p.github || p.portfolioUrl);
  setVal("profTitle", p.jobTitle || p.headline);
  setVal("profExperienceYears", p.totalExperience || p.yearsOfExperience);
  setVal("profCurrentCompany", p.currentCompany);
  setVal("profNoticePeriod", p.noticePeriodDays || p.noticePeriod);
  setVal("profSummary", p.summary || p.bio);
  setVal("profSkills", Array.isArray(p.skills) ? p.skills.join(", ") : (p.skills || ""));

  if (p.authorizedUs !== undefined) {
    const el = document.getElementById("profAuthWork");
    if (el) el.value = p.authorizedUs ? "Yes" : "No";
  }
  if (p.sponsorshipRequired !== undefined) {
    const el = document.getElementById("profRequireVisa");
    if (el) el.value = p.sponsorshipRequired ? "Yes" : "No";
  }
}

async function saveProfileFromForm() {
  const getVal = (id) => document.getElementById(id)?.value?.trim() || "";

  activeProfile.fullName = getVal("profFullName");
  activeProfile.email = getVal("profEmail");
  activeProfile.phone = getVal("profPhone");
  activeProfile.city = getVal("profCity");
  activeProfile.linkedin = getVal("profLinkedIn");
  activeProfile.linkedInUrl = getVal("profLinkedIn");
  activeProfile.github = getVal("profGitHub");
  activeProfile.portfolioUrl = getVal("profGitHub");
  activeProfile.jobTitle = getVal("profTitle");
  activeProfile.headline = getVal("profTitle");
  activeProfile.totalExperience = getVal("profExperienceYears");
  activeProfile.currentCompany = getVal("profCurrentCompany");
  activeProfile.noticePeriodDays = getVal("profNoticePeriod");
  activeProfile.summary = getVal("profSummary");
  activeProfile.bio = getVal("profSummary");

  const skillsRaw = getVal("profSkills");
  activeProfile.skills = skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  activeProfile.authorizedUs = document.getElementById("profAuthWork")?.value === "Yes";
  activeProfile.sponsorshipRequired = document.getElementById("profRequireVisa")?.value === "Yes";
  activeProfile.updatedAt = Date.now();

  allProfiles[activeProfileId] = activeProfile;

  await new Promise((resolve) => {
    chrome.storage.local.set({
      jobxapplyProfiles: allProfiles,
      jobxapplyProfile: activeProfile,
      jobxapplyActiveProfileId: activeProfileId
    }, resolve);
  });

  updateDashboardUI();
  showToast("Profile saved & synced to extension!");
}

// ── Dashboard Calculations ─────────────────────────────────────────────────
function calculateCompleteness(p) {
  if (!p) return 0;
  const fields = [
    p.fullName,
    p.email,
    p.phone,
    p.city || p.address,
    p.linkedin || p.linkedInUrl,
    p.jobTitle || p.headline,
    p.summary || p.bio,
    (Array.isArray(p.skills) && p.skills.length > 0) || (typeof p.skills === "string" && p.skills.length > 0)
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

function updateDashboardUI() {
  const percent = calculateCompleteness(activeProfile);
  const pEl = document.getElementById("dashReadinessPercent");
  const bEl = document.getElementById("dashReadinessBar");
  if (pEl) pEl.textContent = `${percent}%`;
  if (bEl) bEl.style.width = `${percent}%`;

  // Render Snippets
  const snipContainer = document.getElementById("dashSnippetList");
  if (snipContainer) {
    snipContainer.innerHTML = "";
    const items = [
      { label: "Full Name", val: activeProfile.fullName },
      { label: "Email", val: activeProfile.email },
      { label: "Phone", val: activeProfile.phone },
      { label: "LinkedIn", val: activeProfile.linkedin || activeProfile.linkedInUrl },
      { label: "GitHub", val: activeProfile.github || activeProfile.portfolioUrl },
      { label: "Headline", val: activeProfile.jobTitle || activeProfile.headline },
      { label: "Top Skills", val: Array.isArray(activeProfile.skills) ? activeProfile.skills.slice(0, 5).join(", ") : activeProfile.skills }
    ].filter((it) => it.val);

    items.forEach((it) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:6px 10px; border-radius:6px; cursor:pointer;";
      row.title = "Click to copy";
      row.innerHTML = `<span style="font-size:10px; font-weight:700; color:var(--muted);">${it.label}:</span> <span style="font-size:11px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">${it.val}</span>`;
      row.addEventListener("click", () => {
        navigator.clipboard.writeText(it.val);
        showToast(`Copied ${it.label}`);
      });
      snipContainer.appendChild(row);
    });
  }

  // Render Recent Applications in Dashboard
  const appContainer = document.getElementById("dashRecentApps");
  if (appContainer) {
    if (!applications || applications.length === 0) {
      appContainer.innerHTML = `<div style="text-align:center; padding:10px; color:var(--dim);">No applications logged yet. Track jobs directly from your browser!</div>`;
    } else {
      appContainer.innerHTML = applications.slice(0, 3).map((app) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
          <div>
            <span style="font-weight:700; color:#fff;">${app.company || "Unknown"}</span>
            <span style="color:var(--dim);"> &bull; ${app.role || "Role"}</span>
          </div>
          <span style="font-size:9.5px; font-family:var(--mono); padding:2px 6px; border-radius:4px; background:rgba(91,79,232,0.18); color:#a59bf7;">${app.status || "Applied"}</span>
        </div>
      `).join("");
    }
  }
}

// ── Application Tracker ───────────────────────────────────────────────────
function loadTrackerData() {
  chrome.storage.local.get(["jobxapplyApplications"], (res) => {
    applications = res.jobxapplyApplications || [];
    renderTrackerList();
    updateDashboardUI();
  });
}

function renderTrackerList() {
  const container = document.getElementById("trackerList");
  if (!container) return;
  if (!applications || applications.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--dim); font-size:11px;">No applications tracked yet.</div>`;
    return;
  }
  container.innerHTML = applications.map((app, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 12px;">
      <div>
        <div style="font-size:12px; font-weight:700; color:#fff;">${app.company || "Company"}</div>
        <div style="font-size:10.5px; color:var(--muted);">${app.role || "Role"} &bull; <span style="font-size:9px; color:var(--dim);">${new Date(app.appliedAt || Date.now()).toLocaleDateString()}</span></div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:10px; font-family:var(--mono); padding:3px 7px; border-radius:4px; background:rgba(47,221,196,0.12); color:#2FDDC4; font-weight:700;">${app.status}</span>
        <button data-del="${idx}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px;" title="Delete">&times;</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-del"), 10);
      applications.splice(idx, 1);
      chrome.storage.local.set({ jobxapplyApplications: applications }, () => {
        renderTrackerList();
        updateDashboardUI();
        showToast("Application removed");
      });
    });
  });
}

function saveNewApplication() {
  const company = document.getElementById("trCompany")?.value?.trim();
  const role = document.getElementById("trRole")?.value?.trim();
  const status = document.getElementById("trStatus")?.value || "Applied";
  const url = document.getElementById("trUrl")?.value?.trim() || currentActiveTab?.url || "";

  if (!company) {
    showToast("Please enter a company name");
    return;
  }

  const app = {
    id: "app_" + Date.now().toString(36),
    company,
    role: role || "Candidate",
    status,
    url,
    appliedAt: Date.now()
  };

  applications.unshift(app);
  chrome.storage.local.set({ jobxapplyApplications: applications }, () => {
    document.getElementById("trCompany").value = "";
    document.getElementById("trRole").value = "";
    document.getElementById("trUrl").value = "";
    renderTrackerList();
    updateDashboardUI();
    showToast(`Tracked application for ${company}!`);
  });
}

// ── Autofill Execution ─────────────────────────────────────────────────────
async function executeAutofill() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showToast("No active browser tab found");
      return;
    }

    const payload = buildAutofillPayload(activeProfile, currentPortalRule);

    chrome.tabs.sendMessage(tab.id, {
      type: "jobxapply:autofill",
      payload: payload,
      portal: currentPortalRule.portal
    }, (res) => {
      if (chrome.runtime.lastError) {
        showToast("Cannot autofill this page: " + chrome.runtime.lastError.message);
      } else {
        showToast(`Filled fields on ${currentPortalRule.portal || "portal"}!`);
      }
    });
  } catch (e) {
    showToast("Autofill failed: " + e.message);
  }
}

// ── Resume Generator ───────────────────────────────────────────────────────
function compileResume() {
  const p = activeProfile || {};
  const skillsText = Array.isArray(p.skills) ? p.skills.join(" • ") : (p.skills || "Not specified");

  const resumeText = `${(p.fullName || "YOUR NAME").toUpperCase()}
${p.email || "email@example.com"} | ${p.phone || "+1 555-0199"} | ${p.city || "San Francisco, CA"}
${p.linkedin || ""} ${p.github ? "| " + p.github : ""}

PROFESSIONAL SUMMARY
${p.summary || "Results-driven professional with expertise delivering scalable impact and building robust solutions."}

SKILLS & CORE COMPETENCIES
${skillsText}

PROFESSIONAL EXPERIENCE
${p.currentCompany || "Leading Enterprise"} — ${p.jobTitle || "Software Engineer"}
• Engineered high-performance architectures improving reliability across critical user flows.
• Streamlined automated workflows reducing manual form processing time.
• Collaborated with cross-functional engineering and product stakeholders.

EDUCATION
Bachelor of Science in Computer Science / Related Field
`;

  const container = document.getElementById("resumePreviewContainer");
  if (container) {
    container.textContent = resumeText;
  }
  showToast("Resume compiled successfully!");
}

// ── ATS Checker ────────────────────────────────────────────────────────────
function runAtsAnalysis() {
  const jdText = document.getElementById("atsJdInput")?.value?.trim() || "";
  if (!jdText) {
    showToast("Please paste or extract a job description first");
    return;
  }

  const jdWords = jdText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const commonStopWords = new Set(["and", "the", "for", "with", "that", "this", "from", "have", "will", "your", "work", "team", "years", "role"]);
  const jdKeywords = [...new Set(jdWords.filter((w) => !commonStopWords.has(w)))];

  const profileText = JSON.stringify(activeProfile).toLowerCase();

  const matched = [];
  const missing = [];

  jdKeywords.slice(0, 30).forEach((kw) => {
    if (profileText.includes(kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  });

  const total = matched.length + missing.length;
  const score = total > 0 ? Math.round((matched.length / total) * 100) : 70;

  const resultsCard = document.getElementById("atsResultsCard");
  const scoreVal = document.getElementById("atsScoreValue");
  const scoreBar = document.getElementById("atsScoreBar");
  const matchedEl = document.getElementById("atsMatchedList");
  const missingEl = document.getElementById("atsMissingList");
  const suggEl = document.getElementById("atsSuggestionsList");

  if (resultsCard) resultsCard.style.display = "block";
  if (scoreVal) scoreVal.textContent = `${score}%`;
  if (scoreBar) scoreBar.style.width = `${score}%`;

  if (matchedEl) {
    matchedEl.innerHTML = matched.slice(0, 15).map((m) => `
      <span style="font-size:9.5px; font-family:var(--mono); padding:2px 6px; border-radius:4px; background:rgba(47,221,196,0.15); color:#2FDDC4;">+ ${m}</span>
    `).join("");
  }

  if (missingEl) {
    missingEl.innerHTML = missing.slice(0, 15).map((m) => `
      <span style="font-size:9.5px; font-family:var(--mono); padding:2px 6px; border-radius:4px; background:rgba(245,166,35,0.15); color:#ffc254;">- ${m}</span>
    `).join("");
  }

  if (suggEl) {
    suggEl.innerHTML = `
      <li>Incorporate missing keywords (${missing.slice(0, 4).join(", ")}) into your experience bullet points.</li>
      <li>Keep single-column typography to maximize machine parseability.</li>
      <li>Ensure job title matches the target title directly in your resume header.</li>
    `;
  }

  showToast(`ATS Score calculated: ${score}%`);
}

async function extractJdFromActiveTab() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "jobxapply:extractJobText" }, (res) => {
      if (res?.text) {
        document.getElementById("atsJdInput").value = res.text.slice(0, 4000);
        showToast("Extracted job description from page!");
      } else {
        showToast("Paste job description manually or ensure job tab is focused");
      }
    });
  } catch (e) {
    showToast("Could not extract from tab");
  }
}

// ── Cover Letter Generator ─────────────────────────────────────────────────
function generateCoverLetter() {
  const p = activeProfile || {};
  const company = document.getElementById("clCompanyInput")?.value?.trim() || "Hiring Team";
  const role = document.getElementById("clRoleInput")?.value?.trim() || (p.jobTitle || "Software Engineer");
  const strengths = document.getElementById("clKeyStrengths")?.value?.trim() || (Array.isArray(p.skills) ? p.skills.slice(0, 3).join(", ") : "software architecture and problem solving");

  const letter = `Dear ${company} Hiring Team,

I am writing to express my strong enthusiasm for the ${role} position at ${company}. With a track record of driving scalable results and deep expertise in ${strengths}, I am confident in my ability to make an immediate, meaningful impact on your team.

Throughout my career, I have focused on delivering high-reliability systems and optimizing performance across complex product flows. At ${p.currentCompany || "my current organization"}, I championed initiatives that improved efficiency and solved mission-critical bottlenecks.

What excites me most about ${company} is your commitment to high engineering standards and user-centric innovation. I look forward to bringing my background in ${strengths} to help accelerate your upcoming milestones.

Thank you for your time and consideration. I welcome the opportunity to discuss how my qualifications align with your goals.

Sincerely,
${p.fullName || "Candidate"}
${p.email || ""} | ${p.phone || ""}
${p.linkedin || ""}`;

  const out = document.getElementById("clOutput");
  if (out) out.value = letter;
  showToast("Drafted cover letter!");
}

// ── Event Listeners ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  await updateActivePortalInfo();
  await loadStoredProfiles();
  loadTrackerData();

  // Header & Global Actions
  document.getElementById("spAutofillActiveBtn")?.addEventListener("click", executeAutofill);
  document.getElementById("dashFillBtn")?.addEventListener("click", executeAutofill);
  document.getElementById("spOpenFullTabBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  });

  // Persona Switching
  document.getElementById("spPersonaSelect")?.addEventListener("change", (e) => {
    activeProfileId = e.target.value;
    activeProfile = allProfiles[activeProfileId] || activeProfile;
    chrome.storage.local.set({ jobxapplyActiveProfileId: activeProfileId }, () => {
      populateProfileForm();
      updateDashboardUI();
      showToast(`Switched persona to ${e.target.value}`);
    });
  });

  // Profile Form Saving
  document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfileFromForm);
  document.getElementById("saveProfileBottomBtn")?.addEventListener("click", saveProfileFromForm);

  // Resume Actions
  document.getElementById("generateResumeBtn")?.addEventListener("click", compileResume);
  document.getElementById("copyResumeTextBtn")?.addEventListener("click", () => {
    const text = document.getElementById("resumePreviewContainer")?.textContent || "";
    navigator.clipboard.writeText(text);
    showToast("Copied resume text!");
  });

  // ATS Checker Actions
  document.getElementById("atsRunCheckBtn")?.addEventListener("click", runAtsAnalysis);
  document.getElementById("atsExtractFromTabBtn")?.addEventListener("click", extractJdFromActiveTab);

  // Cover Letter Actions
  document.getElementById("clGenerateBtn")?.addEventListener("click", generateCoverLetter);
  document.getElementById("clCopyBtn")?.addEventListener("click", () => {
    const text = document.getElementById("clOutput")?.value || "";
    navigator.clipboard.writeText(text);
    showToast("Copied cover letter!");
  });

  // Tracker Actions
  document.getElementById("trSaveBtn")?.addEventListener("click", saveNewApplication);
  document.getElementById("dashLogAppBtn")?.addEventListener("click", () => {
    document.querySelector('.sp-nav-tab[data-view="trackerView"]')?.click();
  });

  // Settings Actions
  document.getElementById("setSavePasscodeBtn")?.addEventListener("click", () => {
    const passcode = document.getElementById("setPasscode")?.value?.trim() || "";
    chrome.storage.local.set({ jobxapplyPasscode: passcode }, () => {
      showToast("Vault Passcode updated!");
    });
  });

  document.getElementById("setLoadMockBtn")?.addEventListener("click", () => {
    activeProfile = { ...MOCK_PROFILE_DATA };
    allProfiles[activeProfileId] = activeProfile;
    chrome.storage.local.set({
      jobxapplyProfiles: allProfiles,
      jobxapplyProfile: activeProfile
    }, () => {
      populateProfileForm();
      updateDashboardUI();
      showToast("Loaded sample test profile!");
    });
  });

  document.getElementById("setNewPersonaBtn")?.addEventListener("click", () => {
    const name = prompt("Enter persona name (e.g. SDE, Product Manager):");
    if (!name) return;
    const newId = "persona_" + Date.now().toString(36);
    allProfiles[newId] = {
      ...activeProfile,
      profileName: name,
      jobTitle: name
    };
    activeProfileId = newId;
    activeProfile = allProfiles[newId];
    chrome.storage.local.set({
      jobxapplyProfiles: allProfiles,
      jobxapplyProfile: activeProfile,
      jobxapplyActiveProfileId: activeProfileId
    }, () => {
      populatePersonaDropdown();
      populateProfileForm();
      updateDashboardUI();
      showToast(`Created persona: ${name}`);
    });
  });

  // Listen to tab events to update detected portal live in the side panel
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(updateActivePortalInfo);
  }
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "complete") {
        updateActivePortalInfo();
      }
    });
  }
});
