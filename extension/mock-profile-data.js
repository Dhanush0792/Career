// Comprehensive Mock Profile Test Dataset for JobXApply Extension and Web Sync
// Contains realistic, production-grade test data covering every supported category and portal field

export const MOCK_PROFILE_DATA = {
  id: "default",
  profileName: "Senior Full Stack Engineer",
  
  // ── Personal & Contact ──────────────────────────────────────────────────
  fullName: "Alex R. Morgan",
  firstName: "Alex",
  lastName: "Morgan",
  dob: "1998-05-14",
  age: 28,
  fatherName: "Robert Morgan",
  motherName: "Eleanor Morgan",
  email: "alex.morgan.dev@gmail.com",
  alternativeEmail: "alex.morgan.work@outlook.com",
  phoneCode: "1",
  phone: "5550192834",
  address: "742 Evergreen Terrace, Apt 4B",
  city: "San Francisco",
  state: "California",
  country: "United States",
  pincode: "94107",
  zip: "94107",
  maritalStatus: "Single",

  // ── Academics (10th, 12th, UG, PG, Masters, PhD) ────────────────────────
  // 10th Standard / Matriculation
  edu10_school: "Westfield High School",
  edu10_board: "State Board of Secondary Education",
  edu10_year: "2014",
  edu10_cgpa: "9.6 CGPA",

  // 12th Standard / Higher Secondary
  edu12_school: "Westfield Senior Secondary College",
  edu12_board: "State Higher Secondary Board",
  edu12_year: "2016",
  edu12_cgpa: "94.5%",

  // Undergraduate (UG)
  eduGrad_college: "University of California, Berkeley",
  eduGrad_degree: "Bachelor of Science",
  eduGrad_stream: "Computer Science and Engineering",
  eduGrad_year: "2020",
  eduGrad_cgpa: "3.85 GPA",
  eduGrad_pursuing: false,

  // Postgraduate (PG)
  eduPG_college: "Stanford University",
  eduPG_degree: "Master of Science",
  eduPG_stream: "Software Engineering & Distributed Systems",
  eduPG_year: "2022",
  eduPG_cgpa: "3.92 GPA",
  eduPG_pursuing: false,

  // Masters (Secondary / Alias)
  eduMasters_college: "Stanford University",
  eduMasters_degree: "Master of Science",
  eduMasters_stream: "Computer Science",
  eduMasters_year: "2022",
  eduMasters_cgpa: "3.92 GPA",
  eduMasters_pursuing: false,

  // PhD / Doctorate
  eduPhD_college: "Massachusetts Institute of Technology (Affiliate)",
  eduPhD_degree: "Doctor of Philosophy (Hon. Candidate)",
  eduPhD_stream: "Artificial Intelligence & Distributed Consensus",
  eduPhD_year: "2026",
  eduPhD_cgpa: "Honors",
  eduPhD_pursuing: false,

  // Generic Academic Fallbacks
  education: "Master of Science in Software Engineering, Stanford University (2022); B.S. in Computer Science, UC Berkeley (2020)",
  college: "Stanford University",

  // ── Professional & Employment ───────────────────────────────────────────
  employmentStatus: "Experienced",
  expectedSalary: "$145,000 / year",
  noticePeriod: "30",
  totalExperience: "4",
  targetRole: "Senior Full Stack Engineer",
  targetRoles: "SDE, Full Stack Developer, Backend Developer, Frontend Developer",
  headline: "Senior Full Stack Software Engineer | React, Node.js, TypeScript, Distributed Cloud Architecture",
  skills: "JavaScript, TypeScript, React.js, Node.js, Python, PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS, REST APIs, GraphQL, Git, CI/CD",
  summary: "Results-driven Senior Full Stack Engineer with 4+ years of professional experience architecting scalable distributed systems and modern web applications. Proven track record leading product initiatives from concept to production, optimizing database queries by 45%, and building secure zero-knowledge encrypted applications.",
  linkedin: "https://linkedin.com/in/alex-morgan-engineer",
  github: "https://github.com/alexmorgan-dev",
  portfolio: "https://alexmorgan-portfolio.io",

  // ── Work History & Experience ───────────────────────────────────────────
  experience: `Senior Software Engineer @ TechMatrix Systems (2022 - Present)
- Led frontend and backend architecture for enterprise SaaS platform serving 500k+ monthly active users using React, Node.js, and PostgreSQL.
- Architected high-throughput microservices handling 25,000 requests per minute with Redis caching and distributed worker queues.
- Reduced server latency by 42% through optimized database indexing and asynchronous batch processing.
- Mentored 6 junior and mid-level software engineers across agile sprints and code review cycles.

Software Engineer @ CloudWave Solutions (2020 - 2022)
- Built and maintained customer-facing dashboards and billing integrations using React, Tailwind CSS, and Stripe API.
- Implemented robust unit and integration testing pipelines with Jest and Playwright achieving 92% test coverage.
- Collaborated cross-functionally with product managers and UX designers to roll out 12 major feature milestones on schedule.`,

  // ── Documents ───────────────────────────────────────────────────────────
  resumeDraft: `ALEX R. MORGAN
San Francisco, CA | (555) 019-2834 | alex.morgan.dev@gmail.com
LinkedIn: linkedin.com/in/alex-morgan-engineer | GitHub: github.com/alexmorgan-dev | Portfolio: alexmorgan-portfolio.io

PROFESSIONAL SUMMARY
Senior Full Stack Engineer with 4+ years of experience building mission-critical distributed systems and performant cloud web applications. Proficient in React, Node.js, TypeScript, Python, and cloud infrastructure.

TECHNICAL SKILLS
Languages: JavaScript (ES6+), TypeScript, Python, SQL, Go
Frameworks: React, Next.js, Node.js, Express, Fastify, Django
Databases: PostgreSQL, MongoDB, Redis, MySQL
Cloud & DevOps: AWS (EC2, S3, RDS, Lambda), Docker, Kubernetes, GitHub Actions, Terraform
Architecture: Microservices, REST APIs, GraphQL, WebSocket, Event-Driven Systems

EXPERIENCE
Senior Software Engineer - TechMatrix Systems (San Francisco, CA) | 2022 - Present
- Architected microservices supporting 500k+ active users with 99.99% uptime.
- Spearheaded database query optimization reducing average P95 latency from 420ms to 95ms.
- Built reusable UI component system adopted across 8 engineering teams.

Software Engineer - CloudWave Solutions (Berkeley, CA) | 2020 - 2022
- Engineered real-time telemetry streaming service using WebSockets and Node.js.
- Automated deployment workflows via GitHub Actions cutting release times by 65%.

EDUCATION
Master of Science in Software Engineering - Stanford University (2022)
Bachelor of Science in Computer Science - University of California, Berkeley (2020)`,

  coverLetterDraft: `Dear Hiring Team,

I am writing to express my enthusiastic interest in the Software Engineering position. With over four years of experience designing and scaling web applications across high-growth technology companies, I have honed the technical expertise and leadership necessary to make an immediate impact on your team.

In my recent work at TechMatrix Systems, I architected distributed cloud backends and responsive interfaces serving over 500,000 monthly active users. My focus has consistently centered on writing clean, modular code, driving test automation, and collaborating closely with product designers to ship reliable features rapidly.

Your company's commitment to building impactful, reliable software resonates strongly with my engineering philosophy. I welcome the opportunity to discuss how my technical skills in full-stack architecture, API optimization, and team mentoring align with your current objectives.

Thank you for your time and consideration.

Sincerely,
Alex R. Morgan`,

  otherDocuments: "AWS Certified Solutions Architect (Associate), Certified Kubernetes Application Developer (CKAD), Triplebyte Certified Generalist Software Engineer.",

  // ── Additional & Medical Declarations ────────────────────────────────────
  handicapped: "No",
  healthIssues: "None. Fit for all employment conditions, on-site, hybrid, and remote responsibilities.",

  // ── Behavioral Q&A Vault ────────────────────────────────────────────────
  q_why_hire: "You should hire me because I combine deep technical expertise across modern full-stack architectures with an owner's mindset. Over the past 4 years, I have repeatedly delivered high-uptime platforms, solved complex performance bottlenecks, and elevated team productivity through clear code design and proactive communication.",

  q_why_company: "I am drawn to your company because of your high engineering standards, clear customer focus, and innovative approach to solving real-world challenges. Your mission and collaborative culture match exactly what I look for in an engineering organization.",

  q_achievement: "My greatest professional achievement was architecting a zero-downtime database migration and caching layer for TechMatrix Systems. This overhaul handled over 25,000 requests per minute during a critical product surge, reduced P95 latency by 42%, and saved approximately $45,000 annually in cloud compute resources.",

  q_challenge: "During a major release, an unpredicted third-party payment webhook latency caused intermittent checkout failures. I initiated an incident bridge, quickly implemented an idempotent queueing mechanism using Redis and exponential backoff retries, resolved the customer transactions, and established comprehensive automated monitors to prevent recurrence.",

  q_strengths_weaknesses: "My core strengths include systems design, pragmatic problem-solving, and clean, maintainable code architecture. A continuous improvement area for me has been delegating earlier on large-scale tasks; I have actively refined this by establishing clear milestone reviews and pairing with team members early in the development sprint.",

  q_leadership: "At TechMatrix Systems, I took initiative to establish an engineering onboarding playbook and weekly architectural review forum. I directly mentored 3 junior engineers who advanced into independent feature leads within six months, while standardizing our automated code quality checks.",

  // ── Custom Application Snippets ──────────────────────────────────────────
  customSnippets: [
    {
      id: "snip_relocation",
      title: "Willingness to Relocate",
      aliases: "relocate, relocation, willing to relocate, open to relocation",
      body: "Yes, I am fully open to relocating for this opportunity and can complete a smooth relocation within 30 days."
    },
    {
      id: "snip_work_auth",
      title: "Work Authorization",
      aliases: "work authorization, legally authorized, sponsorship, visa, authorized to work",
      body: "I am legally authorized to work in the country and do not require employer visa sponsorship now or in the future."
    },
    {
      id: "snip_remote_preference",
      title: "Remote / Hybrid Preference",
      aliases: "work arrangement, remote work, hybrid, on-site preference, remote or on-site",
      body: "I thrive in remote, hybrid, or on-site team environments and maintain dedicated home office infrastructure with high-speed fiber internet."
    },
    {
      id: "snip_start_date",
      title: "Earliest Start Date",
      aliases: "start date, joining date, when can you start, availability, available from",
      body: "I can start within 2 to 3 weeks upon receipt of an offer, following completion of a standard handover period."
    }
  ]
};
