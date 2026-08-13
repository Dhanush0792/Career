export const DEFAULT_PROFILE_FIELDS = [
  "fullName",
  "firstName",
  "lastName",
  "age",
  "dob",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "zip",
  "headline",
  "summary",
  "education",
  "college",
  "experience",
  "skills",
  "linkedin",
  "github",
  "portfolio",
  "resumeDraft",
  "targetRole"
];

export const FIELD_ALIASES = {
  fullName: ["fullname", "full name", "name"],
  firstName: ["first", "firstname", "given name"],
  lastName: ["last", "lastname", "surname", "family name"],
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
  resumeDraft: ["resume", "cv"],
  targetRole: ["role", "target role", "position", "designation"]
};

export const PORTAL_RULES = [
  {
    match: /naukri\.com/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "Naukri",
    notes: "Multi-step wizard, tag inputs, and bucketed salary fields."
  },
  {
    match: /linkedin\.com/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "LinkedIn",
    notes: "Easy Apply and profile forms need separate step handling."
  },
  {
    match: /myworkdayjobs\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Workday",
    notes: "Persistent wizard with strict validation and combobox widgets."
  },
  {
    match: /boards\.greenhouse\.io|job-boards\.greenhouse\.io/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Greenhouse",
    notes: "Clean semantic HTML, strong core field mapping."
  },
  {
    match: /jobs\.lever\.co/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Lever",
    notes: "Single-page form with some auto-parsed fields that must be verified."
  },
  {
    match: /icims\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "iCIMS",
    notes: "Strict formatting and rigid multi-page validation."
  },
  {
    match: /smartrecruiters\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "SmartRecruiters",
    notes: "Modern single-page form with conversational screening questions."
  }
];

export function getPortalRule(url) {
  const target = String(url || "");
  return PORTAL_RULES.find((rule) => rule.match.test(target)) || {
    tier: "Tier 3 - Default heuristic engine",
    portal: "Unknown",
    notes: "Fallback confidence-scoring engine with manual review flags."
  };
}

export const PORTAL_MAPS = {
  LinkedIn: {
    // common selectors to target LinkedIn Easy Apply / profile forms
    fullName: "input[aria-label*='Full name'], input[placeholder*='Full name'], input[name*='fullName']",
    firstName: "input[aria-label*='First name'], input[placeholder*='First name'], input[name*='firstName']",
    lastName: "input[aria-label*='Last name'], input[placeholder*='Last name'], input[name*='lastName']",
    email: "input[aria-label*='Email'], input[placeholder*='Email'], input[type='email']",
    phone: "input[aria-label*='Phone'], input[placeholder*='Phone'], input[name*='phone']",
    linkedin: "input[aria-label*='LinkedIn'], input[placeholder*='LinkedIn']",
    github: "input[aria-label*='GitHub'], input[placeholder*='GitHub']",
    resume: "input[type='file'], input[accept*='pdf'], input[accept*='doc']"
  },
  Naukri: {
    fullName: "input[placeholder*='Name'], input[name*='name'], input[aria-label*='Name']",
    email: "input[placeholder*='Email'], input[name*='email'], input[type='email']",
    phone: "input[placeholder*='Mobile'], input[name*='mobile'], input[name*='phone']",
    resume: "input[type='file'][name*='resume'], input[type='file']",
    college: "input[placeholder*='College'], input[name*='college']"
  }
};

export function buildAutofillPayload(profile, requestedFields) {
  const fields = requestedFields.length ? requestedFields : DEFAULT_PROFILE_FIELDS;
  const payload = {};
  for (const field of fields) {
    const key = field.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(profile, key)) {
      payload[field] = profile[key];
    } else if (key === "resume") {
      payload[field] = profile.resumeDraft || "";
    } else if (key === "targetrole") {
      payload[field] = profile.targetRole || "";
    } else {
      payload[field] = "";
    }
  }
  return {
    createdAt: new Date().toISOString(),
    source: "careerhub-profile",
    fields,
    payload
  };
}

export function summarizeProfile(profile = {}) {
  const lines = [];
  for (const key of DEFAULT_PROFILE_FIELDS) {
    lines.push(`${key}: ${profile[key] || ""}`);
  }
  return lines.join("\n");
}
