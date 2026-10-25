# TYRA — Product and Engineering Context

## Purpose
TYRA is a lifestyle and personal-control SuperApp that unifies two pillars:
- **Health & Fitness:** calorie and nutrition tracking, exercise, habits, progress and wellness goals.
- **Personal Finance:** income, spending, budgets, debts, savings and financial goals.

The app should be clear for teenagers, adults and older adults, with a modern, premium fintech-inspired appearance. Its goal is to eliminate the need for separate personal-management apps.

## Brand and design
- Brand name: **TYRA**, inspired by Nordic naming aesthetics.
- Design language: clean, modern, restrained, responsive, mobile-first, with light and dark modes.
- Font: Inter (preferred).
- Aurora: primary `#7035D9`; secondary `#008EAE`; light background `#FAF8FF`; main light text `#211A30`; accent `#F3B4E6`.
- Nordic: primary `#2455D6`; secondary `#087F75`; light background `#F4F6F8`; main light text `#18232F`; accent `#88BFF2`.
- Indigo: primary `#4945E8`; secondary `#16A889`; light background `#F7F8FC`; main light text `#171B2B`; accent `#B5A5FF`.
- Theme selection is freely available to all users. Optional gender-based theme suggestions: female -> Aurora, male -> Nordic, otherwise -> Indigo; do not make gender mandatory or couple the user's stored gender to the stored theme. Allow changing themes at any time.
- Appearance: light, dark, or follow system. Design accessible variants rather than mechanically inverting colors.
- Initial navigation concept: Home, Health, Finance, Profile; adapt navigation for larger screens.

## Engineering vision
- Monorepo, organized for junior readability.
- Prefer feature-first frontend, modular-monolith backend and simplified Clean Architecture where useful.
- Minimize unnecessary layers; keep separation between Health, Finance, Identity and Dashboard.
- Keep theme/design tokens centralized and UI elements reusable where they truly are shared.
- Treat financial and health information as sensitive. Minimize collection and secure access.
- Claude is currently implementing functionality. Codex serves mainly as an independent quality reviewer.

## Working agreement
- First assess the **existing** stack and codebase. Nothing in this document mandates React, TypeScript, a particular backend framework, package manager or database.
- Do not perform a large migration without explicit approval.
- Reviews should focus on the changed files and their dependencies, with actionable, prioritized findings.
- Write a concise, ready-to-paste Spanish correction prompt for Claude after each review.
- Never automatically commit or push. Request approval before code modifications.

## Unknowns to discover from repository
Actual frontend/backend frameworks, package manager, build/test commands, folder structure, database, authentication, deployment and progress completed by Claude. Document findings rather than guessing.
