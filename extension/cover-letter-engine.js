// extension/cover-letter-engine.js
// Client-side Cover Letter Engine: Templates, Generator, LaTeX compiler & ATS-optimized Tailoring
// Standalone, zero-dependency module exporting to window.CoverLetterEngine (and module.exports if Node)

(function(root) {
  'use strict';

  // ── 1. Role Summaries & Pitches Library ────────────────────────────────────
  const ROLE_SUMMARIES = {
    sde: {
      student: {
        summary: "Proactive Computer Science student with strong fundamentals in data structures, algorithms, and full-stack software development. Proficient in designing responsive web applications and writing clean, scalable, object-oriented code. Seeking an entry-level Software Development Engineer role to build high-performance systems."
      },
      fresher: {
        summary: "Goal-driven Computer Science graduate equipped with robust programming capabilities in modern frameworks and backend API design. Demonstrated competence through academic capstone projects, clean architecture practices, and unit testing. Seeking an entry-level SDE role to engineer resilient software solutions."
      },
      experienced: {
        summary: "Results-oriented Software Development Engineer with extensive experience architecting distributed systems, scalable microservices, and high-throughput APIs. Proven track record of optimizing database performance, improving latency by 35%, and leading Agile engineering sprints to deliver mission-critical software."
      }
    },
    junior_developer: {
      student: {
        summary: "Enthusiastic developer student skilled in modern web technologies including JavaScript, HTML5, CSS3, and Git version control. Experienced in collaborating on team coding projects, translating wireframes into functional interfaces, and debugging fullstack code. Eager to contribute to rapid development cycles."
      },
      fresher: {
        summary: "Adaptable Junior Developer with foundational expertise in frontend and backend software development and relational databases. Quick learner adept at code reviews, continuous integration pipelines, and component-driven development. Dedicated to delivering clean, maintainable code within engineering teams."
      },
      experienced: {
        summary: "Dynamic Junior Developer with demonstrated hands-on experience building production features, resolving critical bugs, and integrating third-party RESTful APIs. Adept at cross-functional teamwork, Agile development, and implementing responsive UI components with high test coverage."
      }
    },
    java_python_c_cpp: {
      student: {
        summary: "Analytical engineering student focused on low-level systems programming, object-oriented software engineering, and multithreaded design. Highly proficient in Java, Python, and C/C++ with experience creating high-efficiency algorithms and data pipelines. Seeking a core software developer opportunity."
      },
      fresher: {
        summary: "Motivated software engineering graduate with specialized proficiency in Java, Python, and C++ application design. Solid understanding of memory management, database connectivity, and backend system optimization. Eager to engineer high-reliability, enterprise-grade software products."
      },
      experienced: {
        summary: "Senior backend developer specializing in core Java, Python microservices, and high-concurrency C/C++ systems engineering. Proven success in reducing memory footprints, architecting fault-tolerant backend infrastructure, and integrating cloud computing pipelines for enterprise scale."
      }
    },
    senior_developer: {
      student: {
        summary: "Advanced graduate researcher in computer systems and software architecture, skilled in distributed cloud computing and scalable algorithms. Experienced in leading open-source projects, mentoring junior developers, and designing fault-tolerant prototypes for complex engineering domains."
      },
      fresher: {
        summary: "High-achieving computer science master's graduate with in-depth knowledge of distributed computing, cloud microservices, and system reliability engineering. Eager to take ownership of end-to-end feature delivery, architectural reviews, and high-impact technology implementations."
      },
      experienced: {
        summary: "Strategic Senior Developer and Technical Architect with proven history of leading engineering squads, spearheading cloud migrations, and establishing scalable engineering standards. Expert in reducing cloud infrastructure costs, designing decoupled microservices, and mentoring engineering teams."
      }
    },
    marketing: {
      student: {
        summary: "Data-informed business marketing student skilled in digital advertising, social media analytics, and campaign funnel optimization. Experienced in conducting customer market research, A/B testing ad creatives, and crafting targeted email marketing sequences to boost conversion rates."
      },
      fresher: {
        summary: "Proactive Marketing graduate with strong analytical skills in Google Analytics, paid search, SEO strategy, and inbound lead generation. Adept at building customer acquisition funnels, managing campaign budgets, and translating performance data into actionable growth strategies."
      },
      experienced: {
        summary: "Performance Marketing Specialist with proven background driving multi-channel growth, customer acquisition, and ROI optimization. Track record of scaling digital marketing budgets, increasing customer lifetime value by 25%, and launching viral brand awareness campaigns."
      }
    },
    customer_care: {
      student: {
        summary: "Empathetic student communicator with exceptional interpersonal skills, active listening capabilities, and conflict resolution techniques. Passionate about delivering memorable customer experiences, managing ticketing workflows, and solving user queries with high accuracy and speed."
      },
      fresher: {
        summary: "Customer-first graduate equipped with strong verbal and written communication skills and CRM software proficiency. Skilled in handling complex customer inquiries, providing proactive troubleshooting, and maintaining top-tier customer satisfaction ratings."
      },
      experienced: {
        summary: "Dedicated Customer Care Specialist and Team Lead with deep experience managing support operations, reducing ticket resolution time by 30%, and coaching support agents. Expert in escalation management, CRM workflows, and driving long-term customer retention."
      }
    },
    business_executive: {
      student: {
        summary: "Strategic management student focused on corporate finance, sales pipeline development, and market penetration models. Skilled in analyzing competitive landscapes, drafting client pitch decks, and identifying operational cost-saving opportunities."
      },
      fresher: {
        summary: "Ambitious Business graduate with strong competencies in business analytics, B2B client communications, and strategic planning. Eager to drive revenue growth, cultivate strategic client relationships, and optimize daily operational execution."
      },
      experienced: {
        summary: "Results-driven Business Operations Executive with background leading revenue strategy, corporate partnerships, and operational scaling. Proven track record of closing high-value client contracts, streamlining internal processes, and exceeding annual growth targets."
      }
    }
  };

  // Predefined Narrative Pitch Summaries
  const PREDEFINED_PITCHES = {
    technical: "Over the course of my career, I have focused on constructing highly scalable, resilient frontend and fullstack web architectures. My stack centers on modern web technologies, JavaScript/TypeScript, robust API design, and distributed cloud infrastructures. I specialize in optimizing bundle sizes, reducing rendering overhead, and establishing reliable end-to-end architectures. I am excited to apply these core skills to your engineering challenges.",
    executive: "I offer a proven track record of product strategy, team scaling, and metrics-driven development cycles. By aligning engineering priorities with key customer acquisitions, I have led departments to launch core features that reduced churn by 18% and optimized cloud operational expenditure by $45K annually. I look forward to bringing this leadership to your team.",
    narrative: "My journey into software engineering started with building developer tools that automated my own workflows, eventually growing into a passionate career solving real-world challenges. I believe that product engineering requires listening closely to users, keeping codebases clean, and shipping early and often. I am motivated to join your collaborative culture.",
    pivot: "Having spent several years refining my core skills in data analytics and customer strategy, I have pivoted into full-time product engineering. My background gives me a unique advantage: I don't just build code; I understand customer journeys, user data, and how web applications drive user retention. I am eager to apply this unique cross-functional skill set to your team."
  };

  // ── 2. LaTeX Character Escaping ───────────────────────────────────────────
  function escapeLatex(str) {
    if (!str) return '';
    const cleanStr = String(str).replace(/[\u2600-\u27BF]|[\u{1F300}-\u{1FAFF}]/gu, '');
    return cleanStr
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%$#_{}])/g, '\\$1')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/</g, '\\textless{}')
      .replace(/>/g, '\\textgreater{}')
      .replace(/\n/g, ' ');
  }

  // ── 3. Template Metadata ──────────────────────────────────────────────────
  const TEMPLATE_METADATA = [
    { id: "01", name: "Classic Professional", font: "Palatino / Serif", layout: "Single Column Right-Aligned Header", bestFor: "ATS-heavy formal corporate applications" },
    { id: "02", name: "Minimal Modern", font: "Helvetica / Sans-Serif", layout: "Clean Divider Accent Line", bestFor: "Tech companies, design-forward teams" },
    { id: "03", name: "Narrative Centered", font: "Charter / Serif", layout: "Centered Header with Half-Rule", bestFor: "Storytelling, career changers, creative roles" },
    { id: "04", name: "Executive Bold", font: "Times / Serif", layout: "Header with Right-Aligned Profile Tag", bestFor: "Leadership, managerial, senior positions" },
    { id: "05", name: "Technical Terminal", font: "Courier / Monospace", layout: "Developer Console / Code Styled", bestFor: "Backend, DevOps, Systems engineering" },
    { id: "06", name: "Bold Impact", font: "Helvetica / Sans-Serif", layout: "Heavy Top Rule & Bold Contact Bar", bestFor: "Consulting, fast-paced sales, agency roles" },
    { id: "07", name: "Academic Formal", font: "Times / Serif", layout: "Centered Header, Compact Spacing", bestFor: "Research, academic, non-profit institutions" },
    { id: "08", name: "Startup Clean", font: "Helvetica / Sans-Serif", layout: "Subtle Gray Divider, Modern Typography", bestFor: "Y-Combinator / VC-backed early-stage startups" },
    { id: "09", name: "Career Transition", font: "Palatino / Serif", layout: "Full Width Divider, Centered Title", bestFor: "Industry switchers, pivoting professionals" },
    { id: "10", name: "Executive Referral", font: "Times / Serif", layout: "Classic Right Header with Salutation Highlight", bestFor: "Warm intros, networking referrals" }
  ];

  // ── 4. LaTeX Template Formatters (10 Complete Templates) ──────────────────
  const TEMPLATES = {
    "01": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=1.0in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{palatino}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1em}
\\hypersetup{colorlinks=true, urlcolor=blue}

\\begin{document}

\\begin{flushright}
  \\textbf{${escapeLatex(d.fullName)}}\\\\
  ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)}\\\\
  ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}\\\\
\\end{flushright}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
${escapeLatex(d.companyName)}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1em}
${escapeLatex(d.signOff)}

\\vspace{2em}
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "02": function(d) {
      return `\\documentclass[a4paper,10pt]{article}
\\usepackage[a4paper,margin=0.9in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.8em}
\\hypersetup{colorlinks=true, urlcolor=gray}

\\begin{document}

{\\Huge \\textbf{${escapeLatex(d.fullName)}}}\\\\[4pt]
{\\small \\textcolor{gray}{${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}}}\\\\
\\rule{\\textwidth}{0.5pt}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{0.5em}
\\textbf{${escapeLatex(d.recipientName)}}\\\\
${escapeLatex(d.recipientTitle)} \\,|\\, \\textbf{${escapeLatex(d.companyName)}}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{0.5em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[1.5em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "03": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=1.0in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{charter}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\begin{center}
  {\\Huge \\textbf{${escapeLatex(d.fullName)}}}\\\\[4pt]
  {\\small ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}}\\\\
  \\rule{0.5\\textwidth}{0.4pt}
\\end{center}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
${escapeLatex(d.companyName)}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1.5em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[2em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "04": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=0.95in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{times}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1.1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\textbf{${escapeLatex(d.fullName)}}\\\\
${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)}\\\\
${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}
\\hfill
\\textbf{EXECUTIVE PROFILE}
\\rule{\\textwidth}{0.8pt}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
${escapeLatex(d.companyName)}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[2em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "05": function(d) {
      return `\\documentclass[a4paper,10pt]{article}
\\usepackage[a4paper,margin=0.9in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{courier}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.85em}
\\hypersetup{colorlinks=true, urlcolor=blue}

\\begin{document}

{\\texttt{Console.log("Hello, Senders");}}\\\\
\\textbf{\\Huge ${escapeLatex(d.fullName)}}\\\\
\\texttt{Contact: ${escapeLatex(d.email)} | ${escapeLatex(d.phone)} | ${escapeLatex(d.linkedinUrl)} | ${escapeLatex(d.portfolioUrl)}}\\\\
\\rule{\\textwidth}{1pt}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)} \\\\
${escapeLatex(d.recipientTitle)} \\\\
\\textbf{${escapeLatex(d.companyName)}} \\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[2em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "06": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=0.9in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\begin{flushleft}
  {\\Huge \\textbf{${escapeLatex(d.fullName)}}}\\\\[4pt]
  \\textbf{CONTACT:} ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}
\\end{flushleft}
\\rule{\\textwidth}{1.5pt}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
\\textbf{${escapeLatex(d.companyName)}}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1.5em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{2em}
${escapeLatex(d.signOff)}\\\\[2.5em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "07": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=1.0in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{times}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1.1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\begin{center}
  \\textbf{${escapeLatex(d.fullName)}}\\\\
  ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}\\\\
\\end{center}
\\vspace{1em}

${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
${escapeLatex(d.companyName)}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1.5em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{2em}
${escapeLatex(d.signOff)}\\\\[2.5em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "08": function(d) {
      return `\\documentclass[a4paper,10pt]{article}
\\usepackage[a4paper,margin=0.85in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.8em}
\\hypersetup{colorlinks=true, urlcolor=gray}

\\begin{document}

\\begin{flushleft}
  {\\Huge \\textbf{${escapeLatex(d.fullName)}}}\\\\[3pt]
  {\\small ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}}
\\end{flushleft}
\\textcolor{gray}{\\rule{\\textwidth}{1pt}}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{0.5em}
${escapeLatex(d.recipientName)} \\\\
${escapeLatex(d.recipientTitle)} \\\\
\\textbf{${escapeLatex(d.companyName)}} \\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[2em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "09": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=1.0in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{palatino}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\begin{center}
  \\textbf{\\Huge ${escapeLatex(d.fullName)}}\\\\
  ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}
\\end{center}
\\rule{\\textwidth}{0.5pt}

\\vspace{1em}
${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
\\textbf{${escapeLatex(d.companyName)}}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{1.5em}
${escapeLatex(d.signOff)}\\\\[2em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    },

    "10": function(d) {
      return `\\documentclass[a4paper,11pt]{article}
\\usepackage[a4paper,margin=1.0in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{times}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1em}
\\hypersetup{colorlinks=true, urlcolor=black}

\\begin{document}

\\begin{flushright}
  \\textbf{${escapeLatex(d.fullName)}}\\\\
  ${escapeLatex(d.email)} \\,|\\, ${escapeLatex(d.phone)} \\,|\\, ${escapeLatex(d.linkedinUrl)} \\,|\\, ${escapeLatex(d.portfolioUrl)}
\\end{flushright}
\\vspace{1em}

${escapeLatex(d.date)}

\\vspace{1em}
${escapeLatex(d.recipientName)}\\\\
${escapeLatex(d.recipientTitle)}\\\\
${escapeLatex(d.companyName)}\\\\
${escapeLatex(d.companyAddress)}

\\vspace{1.5em}
${d.subjectLine ? `\\textbf{Subject: ${escapeLatex(d.subjectLine)}}` : ''}

\\vspace{1em}
${escapeLatex(d.salutation)}

${escapeLatex(d.openingParagraph)}

${escapeLatex(d.bodyParagraph1)}

${escapeLatex(d.bodyParagraph2)}

${escapeLatex(d.closingParagraph)}

\\vspace{2em}
${escapeLatex(d.signOff)}\\\\[2.5em]
\\textbf{${escapeLatex(d.fullName)}}

\\vspace{2em}
${d.enclosureLine ? `Enclosures: ${escapeLatex(d.enclosureLine)}` : ''}

\\end{document}`;
    }
  };

  // ── 5. buildCoverLetterData Helper ─────────────────────────────────────────
  /**
   * Normalizes profile, recipient, and tailoring inputs into a complete cover letter model.
   * @param {Object} profile Candidate profile object
   * @param {Object} options Parameters: companyName, role, recipientName, recipientTitle, recipientAddress, subjectLine, pitchType, jdKeywords, date, enclosureLine
   * @returns {Object} Full data structure ready for rendering or LaTeX compilation
   */
  function buildCoverLetterData(profile = {}, options = {}) {
    const company = options.companyName || options.company || '[Target Company]';
    const role = options.role || options.position || profile.jobTitle || profile.targetRole || 'Software Development Engineer';
    const recipientName = options.recipientName || 'Hiring Team';
    const recipientTitle = options.recipientTitle || 'Hiring Manager';
    const recipientAddress = options.recipientAddress || 'Headquarters / Regional Office';
    const templateId = String(options.templateId || '01');

    const today = options.date || new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    // Determine Pitch/Summary Body
    let summaryBody = '';
    if (options.pitchType && PREDEFINED_PITCHES[options.pitchType]) {
      summaryBody = PREDEFINED_PITCHES[options.pitchType];
    } else if (options.summaryBody) {
      summaryBody = options.summaryBody;
    } else if (profile.summary || profile.bio) {
      summaryBody = profile.summary || profile.bio;
    } else {
      summaryBody = PREDEFINED_PITCHES.technical;
    }

    // Role-specific strengths synthesis
    let strengths = '';
    if (options.strengths) {
      strengths = options.strengths;
    } else if (Array.isArray(profile.skills) && profile.skills.length > 0) {
      strengths = profile.skills.slice(0, 4).join(', ');
    } else if (typeof profile.skills === 'string' && profile.skills.trim()) {
      strengths = profile.skills;
    } else {
      strengths = 'scalable software design, modern APIs, and clean engineering architecture';
    }

    // Body Paragraph 2: Company alignment & JD Keywords incorporation
    let bodyParagraph2 = options.bodyParagraph2;
    if (!bodyParagraph2) {
      if (options.jdKeywords && Array.isArray(options.jdKeywords) && options.jdKeywords.length > 0) {
        const topKw = options.jdKeywords.slice(0, 4).join(', ');
        bodyParagraph2 = `What excites me most about ${company} is your technical rigor and collaborative culture. With hands-on proficiency in ${topKw}, I am well positioned to immediately accelerate your product roadmap and contribute to mission-critical engineering initiatives.`;
      } else {
        bodyParagraph2 = `What excites me most about ${company} is your dedication to engineering excellence and user-centric problem solving. I am eager to apply my experience in modern frameworks, microservices, and reliable architectures to help scale your operations.`;
      }
    }

    const openingParagraph = options.openingParagraph ||
      `I am writing to express my strong interest in the ${role} position at ${company}. As a professional with a solid track record in ${strengths}, I am confident in my ability to immediately add value to your team.`;

    const closingParagraph = options.closingParagraph ||
      `I would welcome the opportunity to discuss how my qualifications, engineering mindset, and collaborative approach align with your upcoming goals. Thank you for your time, consideration, and dedication to building high-impact technology.`;

    const subjectLine = options.subjectLine !== undefined
      ? options.subjectLine
      : `Application for ${role} - ${profile.fullName || 'Candidate'}`;

    return {
      templateId,
      fullName: profile.fullName || 'Candidate Name',
      email: profile.email || 'candidate@example.com',
      phone: profile.phone || '+1 (555) 000-0000',
      linkedinUrl: profile.linkedin || '',
      portfolioUrl: profile.portfolio || profile.github || '',
      date: today,
      recipientName,
      recipientTitle,
      companyName: company,
      companyAddress: recipientAddress,
      subjectLine,
      salutation: options.salutation || `Dear ${recipientName},`,
      openingParagraph,
      bodyParagraph1: summaryBody,
      bodyParagraph2,
      closingParagraph,
      signOff: options.signOff || 'Sincerely,',
      enclosureLine: options.enclosureLine || ''
    };
  }

  // ── 6. generateCoverLetter (Plain Text & Structured) ──────────────────────
  /**
   * Generates a clean plain text cover letter.
   * @param {Object} profile 
   * @param {Object} options 
   * @returns {string} Plain text letter
   */
  function generateCoverLetter(profile, options = {}) {
    const d = buildCoverLetterData(profile, options);
    const lines = [];

    lines.push(d.fullName);
    lines.push(`${d.email} | ${d.phone}`);
    if (d.linkedinUrl) lines.push(d.linkedinUrl);
    if (d.portfolioUrl) lines.push(d.portfolioUrl);
    lines.push('');
    lines.push(d.date);
    lines.push('');
    lines.push(d.recipientName);
    lines.push(d.recipientTitle);
    lines.push(d.companyName);
    lines.push(d.companyAddress);
    lines.push('');
    if (d.subjectLine) {
      lines.push(`Subject: ${d.subjectLine}`);
      lines.push('');
    }
    lines.push(d.salutation);
    lines.push('');
    lines.push(d.openingParagraph);
    lines.push('');
    lines.push(d.bodyParagraph1);
    lines.push('');
    lines.push(d.bodyParagraph2);
    lines.push('');
    lines.push(d.closingParagraph);
    lines.push('');
    lines.push(d.signOff);
    lines.push('');
    lines.push(d.fullName);
    if (d.enclosureLine) {
      lines.push('');
      lines.push(`Enclosures: ${d.enclosureLine}`);
    }

    return lines.join('\n');
  }

  // ── 7. compileLaTeX ────────────────────────────────────────────────────────
  /**
   * Compiles LaTeX source code from cover letter payload for Overleaf, TeX Live, or client export.
   * @param {Object} data Cover letter data payload (from buildCoverLetterData or custom)
   * @returns {string} Fully formatted LaTeX source
   */
  function compileLaTeX(data) {
    const tmplId = String(data.templateId || '01');
    const formatter = TEMPLATES[tmplId] || TEMPLATES['01'];
    return formatter(data);
  }

  // ── 8. renderRichHTML ──────────────────────────────────────────────────────
  /**
   * Renders high-fidelity HTML for live browser previews in popup or sidepanel.
   * @param {Object} data 
   * @returns {string} HTML string
   */
  function renderRichHTML(data) {
    let fontStyle = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";
    if (['01', '03', '04', '07', '09', '10'].includes(data.templateId)) {
      fontStyle = "font-family: Georgia, 'Times New Roman', serif;";
    } else if (data.templateId === '05') {
      fontStyle = "font-family: 'JetBrains Mono', Courier, monospace;";
    }

    return `
      <div class="cl-rich-preview" style="${fontStyle} line-height: 1.65; color: #1a1a1a; padding: 24px; background: #ffffff; border-radius: 6px;">
        <div style="text-align: right; margin-bottom: 20px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 12px;">
          <strong style="font-size: 16px; letter-spacing: 0.02em; color: #0f172a;">${escapeHTML(data.fullName)}</strong><br>
          <span style="font-size: 12px; color: #475569;">${escapeHTML(data.email)} | ${escapeHTML(data.phone)}</span><br>
          ${data.linkedinUrl ? `<span style="font-size: 11px; color: #64748b;">${escapeHTML(data.linkedinUrl)}</span><br>` : ''}
          ${data.portfolioUrl ? `<span style="font-size: 11px; color: #64748b;">${escapeHTML(data.portfolioUrl)}</span>` : ''}
        </div>

        <div style="margin-bottom: 14px; font-size: 12.5px; color: #475569;">
          ${escapeHTML(data.date)}
        </div>

        <div style="margin-bottom: 18px; font-size: 13px; color: #1e293b;">
          <strong>${escapeHTML(data.recipientName)}</strong><br>
          ${escapeHTML(data.recipientTitle)}<br>
          <strong>${escapeHTML(data.companyName)}</strong><br>
          ${escapeHTML(data.companyAddress)}
        </div>

        ${data.subjectLine ? `
          <div style="margin-bottom: 16px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #0f172a; border-left: 3px solid #00f3ff; padding-left: 8px;">
            Subject: ${escapeHTML(data.subjectLine)}
          </div>
        ` : ''}

        <div style="margin-bottom: 14px; font-weight: 600; color: #1e293b;">
          ${escapeHTML(data.salutation)}
        </div>

        <p style="margin-bottom: 14px; font-size: 13px; line-height: 1.65; color: #334155; text-align: justify;">${escapeHTML(data.openingParagraph)}</p>
        <p style="margin-bottom: 14px; font-size: 13px; line-height: 1.65; color: #334155; text-align: justify;">${escapeHTML(data.bodyParagraph1)}</p>
        <p style="margin-bottom: 14px; font-size: 13px; line-height: 1.65; color: #334155; text-align: justify;">${escapeHTML(data.bodyParagraph2)}</p>
        <p style="margin-bottom: 14px; font-size: 13px; line-height: 1.65; color: #334155; text-align: justify;">${escapeHTML(data.closingParagraph)}</p>

        <div style="margin-top: 22px; margin-bottom: 20px; font-size: 13px; color: #1e293b;">
          ${escapeHTML(data.signOff)}<br><br>
          <strong style="font-size: 14px; color: #0f172a;">${escapeHTML(data.fullName)}</strong>
        </div>

        ${data.enclosureLine ? `
          <div style="font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 16px;">
            Enclosures: ${escapeHTML(data.enclosureLine)}
          </div>
        ` : ''}
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── 9. Module Export ──────────────────────────────────────────────────────
  const CoverLetterEngine = {
    buildCoverLetterData,
    generateCoverLetter,
    compileLaTeX,
    renderRichHTML,
    escapeLatex,
    escapeHTML,
    TEMPLATES,
    TEMPLATE_METADATA,
    ROLE_SUMMARIES,
    PREDEFINED_PITCHES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoverLetterEngine;
  }
  if (typeof root !== 'undefined') {
    root.CoverLetterEngine = CoverLetterEngine;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
