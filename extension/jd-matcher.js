// extension/jd-matcher.js
// Client-side Job Description Matcher, Keyword Extractor & ATS Scoring Engine
// Standalone, zero-dependency module exporting to window.JDMatcher (and module.exports if Node)

(function(root) {
  'use strict';

  // ── 1. Stop words set for tokenization ────────────────────────────────────
  const STOP_WORDS = new Set([
    'the','and','or','to','a','an','in','for','of','with','is','are','be',
    'that','this','will','have','on','at','by','from','as','we','you','our',
    'their','it','not','your','can','all','more','about','if','been','use',
    'any','one','also','its','but','has','was','were','they','who','what',
    'when','how','into','than','then','so','up','out','them','these','those',
    'should','would','could','may','must','shall','do','does','did','get',
    'per','role','work','team','job','experience','position','company','years',
    'looking','join','ideal','candidate','responsibilities','requirements','opportunity',
    'working','including','across','strong','ability','knowledge','plus','environment',
    'well','skills','needed','help','build','building','tools','services','high',
    'great','within','both','such','other','each','make','take','part','new'
  ]);

  // ── 2. Curated High-Value Tech Skills & Credentials Catalog ─────────────────
  const TECH_SKILLS_CATALOG = [
    "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust", "ruby", "php", "swift", "kotlin", "scala",
    "react", "react.js", "next.js", "vue", "vue.js", "angular", "node.js", "nodejs", "express", "fastapi", "django", "flask", "spring boot",
    "html", "html5", "css", "css3", "tailwind", "tailwind css", "sass", "bootstrap", "redux", "graphql", "rest api", "rest apis", "restful", "grpc", "websockets",
    "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "elasticsearch", "dynamodb", "cassandra", "supabase", "firebase", "sql", "nosql",
    "aws", "amazon web services", "azure", "google cloud", "gcp", "docker", "kubernetes", "k8s", "terraform", "ci/cd", "github actions", "jenkins", "gitlab",
    "git", "linux", "bash", "shell", "webpack", "vite", "jest", "playwright", "cypress", "mocha", "pytest", "unit testing", "integration testing",
    "pytorch", "tensorflow", "pandas", "numpy", "scikit-learn", "machine learning", "deep learning", "nlp", "computer vision", "llm", "etl", "data pipelines",
    "microservices", "distributed systems", "system design", "agile", "scrum", "kanban", "devops", "cloud computing", "serverless", "lambda",
    "kafka", "rabbitmq", "sqs", "sns", "event-driven", "mvc", "clean architecture", "domain-driven design", "ddd", "tdd", "bdd",
    "security", "oauth", "jwt", "sso", "rbac", "encryption", "https", "owasp", "api gateway", "load balancer", "reverse proxy", "nginx",
    "performance optimization", "caching", "monitoring", "datadog", "prometheus", "grafana", "sentry", "cloudwatch"
  ];

  // ── 3. Skill & Role Taxonomy ──────────────────────────────────────────────
  const ATS_ROLE_PRESETS = {
    sde: {
      name: "Software Engineer / SDE (General)",
      titles: ["software engineer", "software developer", "sde", "software development engineer", "full stack developer", "frontend engineer"],
      mustHave: ["data structures", "algorithms", "system design", "git", "rest api", "object-oriented programming", "debugging", "unit testing", "agile", "problem solving", "ci/cd", "cloud"],
      niceToHave: ["docker", "kubernetes", "microservices", "aws", "scalability", "design patterns"],
      verbs: ["built", "designed", "developed", "implemented", "optimized", "automated", "architected", "debugged", "deployed", "refactored"],
      summaryDesc: "Leads with years of experience and core technical strengths (languages, systems), one measurable engineering outcome (performance, scale, or delivery speed)."
    },
    backend: {
      name: "Backend Developer",
      titles: ["backend developer", "backend engineer", "server-side developer"],
      mustHave: ["rest api", "database design", "sql", "node.js", "python", "java", "microservices", "authentication", "api integration", "server-side logic", "caching", "docker"],
      niceToHave: ["graphql", "message queues", "redis", "kafka", "load balancing", "kubernetes"],
      verbs: ["built", "architected", "optimized", "integrated", "scaled", "deployed", "engineered", "automated"],
      summaryDesc: "Emphasizes systems the candidate has built end-to-end and a concrete scale/performance number (requests/sec, latency reduction, uptime)."
    },
    java: {
      name: "Java Developer",
      titles: ["java developer", "java engineer", "backend java developer"],
      mustHave: ["java", "spring boot", "spring framework", "hibernate", "rest api", "multithreading", "collections", "jvm", "maven", "microservices", "sql", "junit"],
      niceToHave: ["kafka", "docker", "kubernetes", "aws", "design patterns", "oop"],
      verbs: ["developed", "implemented", "optimized", "engineered", "built", "migrated", "debugged"],
      summaryDesc: "Names the Java ecosystem stack explicitly (Spring, Hibernate, Maven) rather than just 'Java' alone."
    },
    marketing: {
      name: "Marketing Specialist",
      titles: ["marketing executive", "marketing associate", "digital marketing specialist", "marketing specialist", "growth marketer"],
      mustHave: ["seo", "content marketing", "social media marketing", "campaign management", "google analytics", "brand strategy", "email marketing", "market research", "a/b testing", "roi", "lead generation"],
      niceToHave: ["google ads", "meta ads manager", "crm", "marketing automation", "copywriting"],
      verbs: ["launched", "grew", "increased", "managed", "executed", "optimized", "drove", "generated"],
      summaryDesc: "Leads with a quantified growth or campaign-performance result (traffic %, conversion rate, audience growth)."
    },
    sales: {
      name: "Sales Representative",
      titles: ["sales executive", "sales associate", "business development executive", "account executive"],
      mustHave: ["lead generation", "client relationship management", "negotiation", "sales pipeline", "crm", "cold calling", "quota attainment", "prospecting", "closing deals", "revenue growth"],
      niceToHave: ["salesforce", "b2b sales", "account management", "upselling"],
      verbs: ["closed", "generated", "exceeded", "negotiated", "managed", "grew", "secured", "achieved"],
      summaryDesc: "Leads with quota attainment or revenue figures explicitly."
    },
    customer_care: {
      name: "Customer Care Operator",
      titles: ["customer support executive", "customer service representative", "customer care executive", "client support associate"],
      mustHave: ["customer support", "query resolution", "sla compliance", "crm", "escalation handling", "communication skills", "ticketing system", "customer satisfaction", "chat support", "email support"],
      niceToHave: ["zendesk", "freshdesk", "salesforce service cloud", "multichannel support"],
      verbs: ["resolved", "handled", "assisted", "managed", "responded", "improved", "maintained"],
      summaryDesc: "Leads with resolution-rate, response-time, or CSAT figure if available."
    },
    default: {
      name: "Default / General Professional",
      titles: ["professional", "associate", "specialist", "coordinator"],
      mustHave: ["communication", "teamwork", "problem solving", "time management", "documentation", "attention to detail"],
      niceToHave: ["project management", "leadership", "adaptability", "microsoft office"],
      verbs: ["managed", "coordinated", "assisted", "supported", "organized", "completed"],
      summaryDesc: "Used when no specific role is selected, or for early-career profiles without a clear target yet."
    }
  };

  // ── 4. Synonyms & Keyword Equivalencies ───────────────────────────────────
  const ATS_KEYWORD_SYNONYMS = {
    "js": ["javascript"],
    "javascript": ["js"],
    "ts": ["typescript"],
    "typescript": ["ts"],
    "ml": ["machine learning"],
    "machine learning": ["ml"],
    "ai": ["artificial intelligence"],
    "artificial intelligence": ["ai"],
    "ci/cd": ["continuous integration", "cicd"],
    "continuous integration": ["ci/cd", "cicd"],
    "cicd": ["ci/cd", "continuous integration"],
    "aws": ["amazon web services"],
    "amazon web services": ["aws"],
    "seo": ["search engine optimization"],
    "search engine optimization": ["seo"],
    "k8s": ["kubernetes"],
    "kubernetes": ["k8s"],
    "gcp": ["google cloud", "google cloud platform"],
    "google cloud": ["gcp"],
    "rest": ["rest api", "restful", "rest apis"],
    "restful": ["rest", "rest api"],
    "rest api": ["rest", "restful", "rest apis"],
    "db": ["database", "databases"],
    "database": ["db", "databases"],
    "postgres": ["postgresql"],
    "postgresql": ["postgres"],
    "node": ["node.js", "nodejs"],
    "nodejs": ["node", "node.js"],
    "node.js": ["node", "nodejs"]
  };

  // Action verbs dictionary for bullet point quality analysis
  const ACTION_VERBS = {
    strong: [
      "architected", "spearheaded", "engineered", "overhauled", "optimized", "benchmarked",
      "scaled", "automated", "reduced", "accelerated", "eliminated", "orchestrated",
      "deployed", "mentored", "championed", "streamlined", "centralized", "designed",
      "implemented", "executed", "formulated", "delivered", "negotiated", "surpassed", "pioneered"
    ],
    moderate: [
      "developed", "built", "created", "maintained", "analyzed", "configured",
      "tested", "refactored", "integrated", "produced", "monitored", "established",
      "collaborated", "managed", "coordinated", "resolved", "improved", "launched"
    ],
    weak: [
      "assisted", "helped", "worked", "handled", "participated", "contributed",
      "responsible", "tasked", "supported", "attempted", "attended"
    ]
  };

  // ── 5. extractKeywordsFromJD ───────────────────────────────────────────────
  /**
   * Extracts essential keywords, skills, and requirements from raw Job Description text.
   * @param {string} jdText Raw text of job description
   * @returns {{ mustHave: string[], niceToHave: string[], all: string[] }}
   */
  function extractKeywordsFromJD(jdText) {
    if (!jdText || typeof jdText !== 'string') {
      return { mustHave: [], niceToHave: [], all: [] };
    }

    const cleanJD = jdText.toLowerCase();

    // 1. Catalog Matching (Curated n-grams)
    const catalogMatches = [];
    for (let i = 0; i < TECH_SKILLS_CATALOG.length; i++) {
      const skill = TECH_SKILLS_CATALOG[i];
      const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const rx = new RegExp('(^|[^a-zA-Z0-9])' + escaped + '(?![a-zA-Z0-9])', 'i');
      if (rx.test(cleanJD) && !catalogMatches.includes(skill)) {
        catalogMatches.push(skill);
      }
    }

    // 2. Frequency-based Token Analysis
    const tokens = cleanJD
      .replace(/[^a-z0-9\s.+#-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    const freqs = {};
    for (let j = 0; j < tokens.length; j++) {
      const t = tokens[j];
      freqs[t] = (freqs[t] || 0) + 1;
    }

    const sortedTerms = Object.keys(freqs).sort((a, b) => freqs[b] - freqs[a]);
    const tokenSkills = sortedTerms.filter(t => !STOP_WORDS.has(t));

    const allMust = Array.from(new Set([...catalogMatches.slice(0, 15), ...tokenSkills.slice(0, 8)]));
    const allNice = Array.from(new Set([...catalogMatches.slice(15, 25), ...tokenSkills.slice(8, 16)]));

    const mustHave = allMust.slice(0, 18);
    const niceToHave = allNice.slice(0, 10);
    const all = Array.from(new Set([...mustHave, ...niceToHave]));

    return {
      mustHave,
      niceToHave,
      all
    };
  }

  // ── 6. Keyword Checking Helper ─────────────────────────────────────────────
  function checkKeywordCredit(kw, cleanText) {
    const kwLow = kw.toLowerCase();
    const escaped = kwLow.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const exactRegex = new RegExp('\\b' + escaped + '\\b', 'i');
    if (exactRegex.test(cleanText)) {
      return 1.0; // 100% exact match
    }

    // Variant synonyms check
    const variants = ATS_KEYWORD_SYNONYMS[kwLow] || [];
    for (let i = 0; i < variants.length; i++) {
      const vEsc = variants[i].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const variantRegex = new RegExp('\\b' + vEsc + '\\b', 'i');
      if (variantRegex.test(cleanText)) {
        return 0.85; // 85% credit
      }
    }

    // Stem or partial match check
    if (cleanText.includes(kwLow) || (kwLow.length > 4 && cleanText.includes(kwLow.substring(0, kwLow.length - 2)))) {
      return 0.5; // 50% credit
    }

    return 0.0;
  }

  // ── 7. Profile Text Extraction Helper ──────────────────────────────────────
  function extractProfileText(profile) {
    if (!profile) return '';
    if (typeof profile === 'string') return profile;

    const parts = [
      profile.fullName || '',
      profile.jobTitle || profile.targetRole || '',
      profile.summary || profile.bio || '',
      profile.email || '',
      profile.phone || '',
      profile.location || '',
      profile.linkedin || '',
      profile.portfolio || profile.github || ''
    ];

    if (Array.isArray(profile.skills)) {
      parts.push(profile.skills.join(' '));
    } else if (profile.skills) {
      parts.push(String(profile.skills));
    }

    if (Array.isArray(profile.experience)) {
      profile.experience.forEach(exp => {
        parts.push(exp.role || exp.title || '');
        parts.push(exp.company || '');
        parts.push(exp.description || exp.bullets || '');
      });
    } else if (profile.experience) {
      parts.push(String(profile.experience));
    }

    if (Array.isArray(profile.education)) {
      profile.education.forEach(edu => {
        parts.push(edu.degree || '');
        parts.push(edu.institution || edu.school || '');
        parts.push(edu.field || '');
      });
    } else if (profile.education) {
      parts.push(String(profile.education));
    }

    if (Array.isArray(profile.projects)) {
      profile.projects.forEach(proj => {
        parts.push(proj.title || proj.name || '');
        parts.push(proj.description || '');
        parts.push(proj.technologies || '');
      });
    } else if (profile.projects) {
      parts.push(String(profile.projects));
    }

    if (profile.certifications) parts.push(String(profile.certifications));
    if (profile.additional) parts.push(String(profile.additional));

    return parts.join(' ');
  }

  // ── 8. scoreATS ────────────────────────────────────────────────────────────
  /**
   * Scores a resume or profile against a target role and/or job description.
   * Completely client-side execution with detailed breakdown, matched/missing terms, and suggestions.
   *
   * @param {Object|string} profile Profile object or plain text
   * @param {Object} options Scoring options:
   *   - targetRole: 'sde' | 'backend' | 'java' | 'marketing' | 'sales' | 'customer_care' | 'default'
   *   - jdText: string (Job description text to extract dynamic terms)
   *   - fileType: 'profile' | 'text' | 'pdf'
   *   - layoutData: { isScanned?: boolean, hasColumns?: boolean, imageCount?: number }
   * @returns {Object} { score, breakdown, matchedKeywords, missingKeywords, suggestions, flags, verbAnalysis }
   */
  function scoreATS(profile, options = {}) {
    const targetRole = options.targetRole || 'default';
    const jdText = options.jdText || '';
    const fileType = options.fileType || 'profile';
    const layoutData = options.layoutData || {};

    const preset = ATS_ROLE_PRESETS[targetRole] || ATS_ROLE_PRESETS.default;
    const isProfile = fileType === 'profile';

    const resumeText = typeof profile === 'string' ? profile : extractProfileText(profile);
    const cleanText = resumeText.toLowerCase().replace(/[^a-z0-9\s.+#-]/g, ' ');
    const lowercaseText = resumeText.toLowerCase();

    const suggestions = [];
    const flags = {
      scanned_image: false,
      multi_column: false,
      embedded_images: false
    };

    // --- Category A: Parseability & Formatting (20%) ---
    let parseabilityScore = 100;
    if (!isProfile && fileType === 'pdf') {
      if (layoutData.isScanned) {
        parseabilityScore = 0;
        flags.scanned_image = true;
        suggestions.push("Parseability failure: The document appears to be an unsearchable scanned image. Convert to a text-selectable PDF.");
      } else {
        if (layoutData.hasColumns) {
          parseabilityScore -= 20;
          flags.multi_column = true;
          suggestions.push("Multi-column layout flagged: Multi-column structures can cause ATS parsers to misread chronological order. Use a single-column layout.");
        }
        if (layoutData.imageCount && layoutData.imageCount > 0) {
          parseabilityScore -= 20;
          flags.embedded_images = true;
          suggestions.push(`Embedded images detected (${layoutData.imageCount}): Remove icons, photos, and graphical shapes to ensure seamless ATS ingestion.`);
        }
      }
    }

    // --- Category B: Job Title Alignment (10%) ---
    let titleScore = 0;
    let exactTitleMatch = false;
    let partialTitleMatch = false;

    for (let t = 0; t < preset.titles.length; t++) {
      const title = preset.titles[t];
      if (lowercaseText.includes(title)) {
        exactTitleMatch = true;
        break;
      }
      const words = title.split(' ');
      for (let w = 0; w < words.length; w++) {
        if (words[w].length > 3 && lowercaseText.includes(words[w])) {
          partialTitleMatch = true;
        }
      }
    }

    if (exactTitleMatch) {
      titleScore = 100;
    } else if (partialTitleMatch) {
      titleScore = 50;
      suggestions.push(`Job Title Alignment: Partially matches target roles. Explicitly include "${preset.titles[0]}" in your resume header or summary.`);
    } else {
      titleScore = 0;
      suggestions.push(`Job Title mismatch: Target role title "${preset.titles.join(', ')}" is missing from your profile title/summary.`);
    }

    // --- Category C: Keyword & Skill Coverage (30%) ---
    const matchedKeywords = [];
    const missingKeywords = [];
    let keywordEarned = 0;
    let keywordTotal = 0;

    let targetMustHave = [...(preset.mustHave || [])];
    let targetNiceToHave = [...(preset.niceToHave || [])];

    if (jdText && typeof jdText === 'string' && jdText.trim().length > 20) {
      const jdKeywords = extractKeywordsFromJD(jdText);
      if (jdKeywords.mustHave.length > 0) {
        const combined = new Set([...jdKeywords.mustHave, ...targetMustHave]);
        targetMustHave = Array.from(combined).slice(0, 20);
        targetNiceToHave = jdKeywords.niceToHave.slice(0, 10);
      }
    }

    targetMustHave.forEach(kw => {
      const credit = checkKeywordCredit(kw, cleanText);
      keywordTotal += 1.0;
      keywordEarned += credit;
      if (credit >= 0.85) {
        matchedKeywords.push(kw);
      } else {
        missingKeywords.push(kw);
      }
    });

    targetNiceToHave.forEach(kw => {
      const credit = checkKeywordCredit(kw, cleanText);
      keywordEarned += credit * 0.5;
    });

    const keywordCoverageScore = Math.min(100, Math.round((keywordEarned / Math.max(1, keywordTotal)) * 100));

    if (keywordCoverageScore < 80 && missingKeywords.length > 0) {
      suggestions.push(`Keyword Coverage: Incorporate essential missing terms into your skills or experience: ${missingKeywords.slice(0, 5).join(', ')}.`);
    }

    // --- Category D: Keyword Density & Spam Avoidance (10%) ---
    let densityScore = 100;
    matchedKeywords.forEach(kw => {
      const escaped = kw.toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const matches = cleanText.match(new RegExp('\\b' + escaped + '\\b', 'g'));
      const count = matches ? matches.length : 0;
      if (count >= 5) {
        densityScore -= 10;
        suggestions.push(`Keyword Stuffing: "${kw}" appears ${count} times. Aim for 2-3 natural repetitions to avoid spam scoring.`);
      } else if (count === 1) {
        densityScore -= 2;
      }
    });
    densityScore = Math.max(0, densityScore);

    // --- Category E: Achievement Quality & Action Verbs (15%) ---
    let achievementScore = 0;
    let totalBullets = 0;
    let quantifiedBullets = 0;

    const METRIC_REGEX = /(?:\b\d+(?:\.\d+)?(?:%|k|m|b|\$|₹|x|\+)?\b|\b[1-9]\d*\b)/i;

    let strongVerbCount = 0;
    let moderateVerbCount = 0;
    let weakVerbCount = 0;
    const weakVerbExamples = [];

    const bulletLines = resumeText
      .split(/[\n•\-\*]/)
      .map(line => line.trim())
      .filter(line => line.length > 15);

    bulletLines.forEach(line => {
      totalBullets++;
      const words = line.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
      const firstWord = words[0] || "";

      if (ACTION_VERBS.strong.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
        strongVerbCount++;
      } else if (ACTION_VERBS.moderate.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
        moderateVerbCount++;
      } else if (ACTION_VERBS.weak.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
        weakVerbCount++;
        if (weakVerbExamples.length < 3) weakVerbExamples.push(`"${firstWord}"`);
      }

      if (METRIC_REGEX.test(line)) {
        quantifiedBullets++;
      }
    });

    const metricDensity = totalBullets > 0 ? Math.round((quantifiedBullets / totalBullets) * 100) : 50;
    const verbQualityRatio = totalBullets > 0
      ? Math.min(1.0, (strongVerbCount * 1.0 + moderateVerbCount * 0.7) / totalBullets)
      : 0.7;

    achievementScore = Math.min(100, Math.round((metricDensity * 0.55) + (verbQualityRatio * 45)));

    if (weakVerbCount > 0) {
      suggestions.push(`Weak Action Verbs: Detected ${weakVerbCount} bullet points opening with weak/passive verbs (${weakVerbExamples.join(', ')}). Upgrade to strong action verbs like Architected, Engineered, or Optimized.`);
    }
    if (metricDensity < 40 && totalBullets > 0) {
      suggestions.push(`Low Metric Quantification: Only ${quantifiedBullets} of ${totalBullets} bullet points contain quantified metrics (%, $, numbers). Apply the Google X-Y-Z formula.`);
    }

    // --- Category F: Section Completeness & Hygiene (15%) ---
    let completenessScore = 100;
    const experienceRegex = /\b(experience|work|employment|history)\b/i;
    const educationRegex = /\b(education|academic|college|university|degree)\b/i;
    const skillsRegex = /\b(skills|technologies|expertise|competencies)\b/i;
    const summaryRegex = /\b(summary|profile|objective|about)\b/i;

    if (!experienceRegex.test(lowercaseText)) {
      completenessScore -= 25;
      suggestions.push("Missing Work Experience section header.");
    }
    if (!educationRegex.test(lowercaseText)) {
      completenessScore -= 25;
      suggestions.push("Missing Education qualifications section.");
    }
    if (!skillsRegex.test(lowercaseText)) {
      completenessScore -= 25;
      suggestions.push("Missing Skills/Technologies inventory section.");
    }
    if (!summaryRegex.test(lowercaseText)) {
      completenessScore -= 15;
      suggestions.push("Missing Professional Summary header to frame target trajectory.");
    }

    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && (wordCount < 180 || wordCount > 900)) {
      completenessScore -= 10;
      suggestions.push(`Resume word count is ${wordCount}. Ideal range is 250-700 words.`);
    }

    completenessScore = Math.max(0, completenessScore);

    // Final Aggregate Calculation
    const finalScore = Math.round(
      (parseabilityScore * 0.20) +
      (titleScore * 0.10) +
      (keywordCoverageScore * 0.30) +
      (densityScore * 0.10) +
      (achievementScore * 0.15) +
      (completenessScore * 0.15)
    );

    return {
      score: Math.min(100, Math.max(0, finalScore)),
      breakdown: {
        parseability: parseabilityScore,
        title: titleScore,
        keyword: keywordCoverageScore,
        density: densityScore,
        achievement: achievementScore,
        completeness: completenessScore
      },
      matchedKeywords,
      missingKeywords,
      verbAnalysis: {
        totalBullets,
        quantifiedBullets,
        metricDensity,
        strongVerbs: strongVerbCount,
        moderateVerbs: moderateVerbCount,
        weakVerbs: weakVerbCount
      },
      suggestions,
      flags
    };
  }

  // ── 9. Match Job Description to Candidate Profile ─────────────────────────
  /**
   * Fast matching utility for extension tabs and sidepanels.
   * Compares a job description directly against a profile.
   * @param {string} jdText 
   * @param {Object|string} profile 
   * @returns {{ score: number, matched: string[], missing: string[], suggestions: string[] }}
   */
  function matchJD(jdText, profile) {
    if (!jdText || !profile) {
      return { score: 0, matched: [], missing: [], suggestions: ["Provide both a job description and profile to evaluate match."] };
    }

    const extracted = extractKeywordsFromJD(jdText);
    const profileText = typeof profile === 'string' ? profile : extractProfileText(profile);
    const cleanProfile = profileText.toLowerCase();

    const matched = [];
    const missing = [];

    extracted.all.forEach(kw => {
      const credit = checkKeywordCredit(kw, cleanProfile);
      if (credit >= 0.85) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    });

    const total = matched.length + missing.length;
    const keywordMatchPct = total > 0 ? Math.round((matched.length / total) * 100) : 50;

    // Check basic structural completeness
    let structureBonus = 0;
    if (typeof profile === 'object') {
      if (profile.fullName) structureBonus += 5;
      if (profile.email) structureBonus += 5;
      if (profile.experience && profile.experience.length > 0) structureBonus += 5;
      if (profile.skills && profile.skills.length > 0) structureBonus += 5;
    } else {
      structureBonus = 15;
    }

    const score = Math.min(100, Math.round(keywordMatchPct * 0.8 + structureBonus));

    const suggestions = [];
    if (missing.length > 0) {
      suggestions.push(`Incorporate high-priority keywords: ${missing.slice(0, 5).join(', ')}.`);
    }
    if (matched.length < 5) {
      suggestions.push("Profile has minimal vocabulary overlap with this job description. Tailor summary & skills.");
    } else {
      suggestions.push("Strong keyword alignment with core job description requirements.");
    }

    return {
      score,
      matched,
      missing,
      suggestions
    };
  }

  // ── 10. Module Export ──────────────────────────────────────────────────────
  const JDMatcher = {
    extractKeywordsFromJD,
    scoreATS,
    matchJD,
    extractProfileText,
    checkKeywordCredit,
    TAXONOMY: ATS_ROLE_PRESETS,
    SYNONYMS: ATS_KEYWORD_SYNONYMS,
    TECH_SKILLS_CATALOG,
    STOP_WORDS,
    ACTION_VERBS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JDMatcher;
    module.exports.default = JDMatcher;
    module.exports.JDMatcher = JDMatcher;
  }
  if (typeof root !== 'undefined') {
    root.JDMatcher = JDMatcher;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

const _exportedJDMatcher = (typeof window !== 'undefined' && window.JDMatcher) || (typeof globalThis !== 'undefined' && globalThis.JDMatcher) || (typeof global !== 'undefined' && global.JDMatcher);
export default _exportedJDMatcher;
export { _exportedJDMatcher as JDMatcher };

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, _exportedJDMatcher);
}

