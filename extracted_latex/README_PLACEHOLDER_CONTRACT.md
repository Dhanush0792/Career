# CareerHub LaTeX Resume Templates — Placeholder Contract

All 10 templates share the exact same placeholder set, so the backend rendering
logic (Profile data -> LaTeX) is written once and works against any of the 10
formats. Swapping a user's selected format is just swapping which .tex file
the same substitution step is applied to.

## Simple (flat) placeholders — direct string substitution

| Placeholder            | Source (Profile Schema)          | Notes                                  |
|-------------------------|-----------------------------------|-----------------------------------------|
| {{FULL_NAME}}           | personal.fullName                 | Required                                |
| {{TARGET_ROLE_TITLE}}   | derived from selected target role | e.g. "Software Engineer". Optional line under name |
| {{EMAIL}}               | personal.email                    | Required                                |
| {{PHONE}}               | personal.phone                    | Required                                |
| {{LOCATION}}            | personal.address.city, state      | Optional                                |
| {{LINKEDIN_URL}}        | personal.links[LinkedIn].url      | Full https:// URL for \href             |
| {{LINKEDIN_DISPLAY}}    | personal.links[LinkedIn].display  | e.g. linkedin.com/in/handle              |
| {{GITHUB_URL}} / {{GITHUB_DISPLAY}}       | personal.links[GitHub]  | Omit block entirely if not present      |
| {{PORTFOLIO_URL}} / {{PORTFOLIO_DISPLAY}} | personal.links[Portfolio] | Omit block entirely if not present    |
| {{SUMMARY}}             | role content bank, role-specific  | 2-3 lines max. Built from REAL profile facts only — never invented |

## Block placeholders — backend substitutes a fully-formed LaTeX block

These are NOT plain text. The backend generates complete, valid LaTeX markup
(the relevant tabularx/itemize/etc. environment, fully closed) for however
many entries the user's profile actually has, and substitutes the whole block
in place of the placeholder. This is what lets one education entry or five
render correctly without touching the template itself.

| Placeholder            | Source (Profile Schema)     | Renders to                                      |
|--------------------------|------------------------------|--------------------------------------------------|
| {{EDUCATION_BLOCK}}      | education[]                  | Complete tabularx (or itemize, per template) rows |
| {{EXPERIENCE_BLOCK}}     | experience[]                 | Complete role blocks with bullet sub-lists        |
| {{PROJECTS_BLOCK}}       | projects[]                   | Complete project blocks with optional GitHub link |
| {{SKILLS_BLOCK}}         | skills[], filtered/ordered by role content bank's skill_priority for the selected target role | Complete itemize with bold category labels |
| {{CERTIFICATIONS_BLOCK}} | certifications[]             | Complete itemize                                  |
| {{ADDITIONAL_BLOCK}}     | preferences + languages/interests, if user opted to include | Complete itemize |

## Rules the backend must follow when generating block content

1. Every fact placed into {{SUMMARY}} or any block must come from the user's
   actual Profile data. The role content bank may choose WHICH real skills to
   lead with, and may supply role-appropriate PHRASING for the summary, but
   must never fabricate a skill, tool, employer, or achievement the user did
   not enter.
2. If a section has zero entries (e.g. no certifications), omit that
   section's heading entirely rather than rendering an empty section.
3. Every template in this set uses black text only, no color, no emoji, no
   icons, no graphics. Do not introduce any of these when generating content
   for a block placeholder.
4. Every template is written to compile cleanly with pdflatex on a standard
   TeX Live install (psnfss font packages only — no fontspec/xelatex
   dependency), so it works in any standard LaTeX build pipeline.

## Format index

| # | File | Style | ATS safety |
|---|------|-------|------------|
| 01 | resume_01_classic_chronological.tex | Classic single-column chronological (baseline) | Safe — single column |
| 02 | resume_02_sidebar_twocolumn.tex | Sidebar two-column (contact/skills left) | Caution — sidebar layouts can reorder in some ATS text extractors |
| 03 | resume_03_compact_dense.tex | Compact dense single-column, freshers/interns | Safe — single column |
| 04 | resume_04_skills_first_functional.tex | Skills-first functional layout | Safe — single column |
| 05 | resume_05_timeline.tex | Timeline-style with date rule | Safe — single column |
| 06 | resume_06_academic_cv.tex | Academic / research CV, allows 2 pages | Safe — single column |
| 07 | resume_07_executive_minimalist.tex | Executive minimalist, generous whitespace | Safe — single column |
| 08 | resume_08_conservative_finance.tex | Conservative finance/banking, Times, small caps | Safe — single column |
| 09 | resume_09_modern_tech_sans.tex | Modern tech sans-serif | Safe — single column |
| 10 | resume_10_grid_modular.tex | Grid-modular two-column with right meta column | Caution — two-column |

Two templates (02, 10) are flagged for ATS caution because some parsers read
multi-column PDFs out of order. Recommend surfacing this in the UI as "Best
for direct human review / referrals" vs. the 8 single-column formats being
"Best for ATS-heavy applications."
