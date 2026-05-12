# SEO + AEO Audit — talvexit.com

**Audited:** 2026-05-05
**Codebase:** `talvex-v1` @ `main`
**Production host:** `talvexit.com` (per HAProxy config)

---

## Executive summary

The SEO bones are good — root metadata, robots.ts, sitemap.ts, and JSON-LD components are all present in the codebase. **But the wiring is broken.** Three different production URLs are hardcoded across files, the structured-data components are dead code (defined but never imported), the `SEOHead.tsx` helper uses an App Router-incompatible `next/head` import that silently fails, and several pieces of metadata still describe the pre-pivot escrow / commission model. The single highest-leverage AEO win — `FAQPage` schema on the existing /how-it-works FAQ — is also not in place.

Phase 1 fixes the broken parts and unblocks the rest. Phase 2 adds structured data and AEO surfaces. Phase 3 builds content depth (per-specialisation pages, glossary, authority signals).

---

## What's already in place

| File | What it does | Status |
|---|---|---|
| `apps/web/src/app/layout.tsx` (lines 25-93) | Root metadata — title template, description, keywords, OG, Twitter, robots, canonical | ✅ Working, but with wrong domain |
| `apps/web/src/app/robots.ts` | Robots config with specific rules for `GPTBot`, `PerplexityBot`, `ClaudeBot` | ✅ Working, wrong sitemap URL |
| `apps/web/src/app/sitemap.ts` | Static sitemap covering 12 public routes | ✅ Working, wrong domain |
| `apps/web/src/components/seo/JsonLd.tsx` | `OrganizationJsonLd`, `WebSiteJsonLd`, `SoftwareApplicationJsonLd` components | ❌ Dead code — never imported |
| `apps/web/src/components/SEOHead.tsx` | Per-page SEO helper using `next/head` | ❌ No-op in App Router (silent failure) |
| `apps/web/src/app/icon.svg`, `apple-icon.tsx` | Web manifest icons | ✅ Working |
| 14 public page routes | Have `metadata` exports for per-page titles/descriptions | ✅ Working, some stale copy |

Public pages with per-page metadata (from `grep`):

- `apps/web/src/app/inv/[token]/page.tsx`
- `apps/web/src/app/subscribe/{cancel,success,page}.tsx`
- `apps/web/src/app/pricing/page.tsx`
- `apps/web/src/app/terms/page.tsx`
- `apps/web/src/app/contractors/page.tsx`
- `apps/web/src/app/provider-agreement/page.tsx`
- `apps/web/src/app/privacy/page.tsx`
- `apps/web/src/app/how-it-works/page.tsx`
- `apps/web/src/app/contact/page.tsx`
- `apps/web/src/app/companies/page.tsx`
- `apps/web/src/app/about/page.tsx`
- `apps/web/src/app/layout.tsx`

---

## Critical issues

### 🔴 P0 — Blocks everything else

#### 1. Three different "production" domains in metadata

| File | Line | URL hardcoded |
|---|---|---|
| `apps/web/src/app/layout.tsx` | 26 | `https://talvex.com.au` |
| `apps/web/src/app/layout.tsx` | 58, 64 | `https://talvex.com.au` |
| `apps/web/src/components/SEOHead.tsx` | 33, 34, 59, 73 | `https://talvexit.com` |
| `apps/web/src/app/sitemap.ts` | 4 | `https://portal1.onsys.com.au` |
| `apps/web/src/app/robots.ts` | 26 | `https://portal1.onsys.com.au` |
| `apps/web/src/components/seo/JsonLd.tsx` | 6, 7, 69, 74 | `https://portal1.onsys.com.au` |

**Real production host (per HAProxy config): `talvexit.com`.**

Google sees three conflicting canonical URLs / sitemap declarations and either picks one wrong or de-ranks all. **This single fix is the biggest SEO lever available.**

**Fix:** Centralise into one env-driven constant (`NEXT_PUBLIC_SITE_URL=https://talvexit.com`), replace all three hardcoded domains.

---

#### 2. The whole `JsonLd.tsx` file is dead code

Three nicely-written components (`OrganizationJsonLd`, `WebSiteJsonLd`, `SoftwareApplicationJsonLd`) are defined in `apps/web/src/components/seo/JsonLd.tsx` but a `grep` for the names returns zero importing pages.

The structured data they would emit isn't on any rendered HTML.

**Fix:** Render them from `layout.tsx` so they appear on every page.

---

#### 3. `SEOHead.tsx` doesn't work in App Router

`apps/web/src/components/SEOHead.tsx:3` imports `next/head`, which is a no-op in the App Router. The component's own comment ([line 11-12](../apps/web/src/components/SEOHead.tsx#L11)) admits this:

> **NOTE on Next.js App Router:** `next/head` is a no-op in the App Router.

Pages that import it (e.g. the homepage at `apps/web/src/app/page.tsx:8`) get **nothing** — silent failure. Title, description, OG tags, Twitter Card, canonical, and the JSON-LD block all fail to emit.

**Fix:** Delete `SEOHead.tsx` and migrate callers to `metadata` exports + a working JSON-LD component.

---

#### 4. Fake `aggregateRating` in JSON-LD

```tsx
// apps/web/src/components/seo/JsonLd.tsx:49-54
aggregateRating: {
  '@type': 'AggregateRating',
  ratingValue: '4.8',
  ratingCount: '127',
  bestRating: '5',
  worstRating: '1',
},
```

Same hardcoded values in `apps/web/src/components/SEOHead.tsx:75-81`.

Once shipped and a Google quality crawl reviews it, the platform gets a manual action for **fake structured data**. The platform is pre-launch — there are no 127 reviews.

**Fix:** Remove `aggregateRating` until there's a real ratings pipeline that can populate it from `prisma.rating`.

---

#### 5. Stale post-pivot copy in SEO descriptions

The marketplace pivot removed escrow and commission. SEO descriptions still describe the old model:

| File | Line | Current text | Issue |
|---|---|---|---|
| `apps/web/src/app/how-it-works/page.tsx` | 7 | `"with built-in PO, escrow, and invoicing"` | escrow is gone |
| `apps/web/src/components/SEOHead.tsx` | 68 | `"Free to post a task. Platform commission on completed engagements"` | no commission post-pivot |
| `apps/web/src/components/seo/JsonLd.tsx` | 9 | `"Enterprise procurement with PO, escrow, and invoicing"` | escrow is gone |
| `apps/web/src/components/seo/JsonLd.tsx` | 46 | `"Free to post. Commission on completed engagements"` | no commission post-pivot |

These were the load-bearing claims we already fixed on visible pages (homepage, /how-it-works content). Search engines and AI assistants currently index the wrong story.

**Fix:** Rewrite each description to match the current direct-payment, subscription-funded model.

---

#### 6. No `og-image.png` actually exists

`apps/web/src/app/layout.tsx:70` references `/og-image.png` (used as the OG and Twitter image). `apps/web/public/` only contains `images/hero-preview.png` — the OG image file is missing.

Every social share renders broken.

**Fix:** Either drop a real `og-image.png` (1200×630, < 1 MB) into `apps/web/public/`, or generate one dynamically via Next.js's `app/opengraph-image.tsx` convention so it's branded correctly.

---

### 🟡 P1 — Real AEO/SEO content gaps

#### 7. `/how-it-works` has 10 FAQ entries but no `FAQPage` JSON-LD

The single highest-leverage AEO win available. The FAQ array in `apps/web/src/app/how-it-works/HowItWorksClient.tsx` (lines 47-87) has 10 well-written Q&A pairs. They render as plain prose. Google AI Overviews, ChatGPT browse, Perplexity, and Claude all preferentially extract `FAQPage` schema. Right now your gold-standard FAQ is invisible to them as Q&A pairs.

**Fix:** Inject `FAQPage` JSON-LD generated from the same `FAQS` array.

---

#### 8. No `HowTo` JSON-LD on the customer/contractor flow steps

The 7-step "For customers" track on /how-it-works is exactly what Google's *How-to* rich result is built for. Same for the contractor and company tracks. Currently rendered as plain text.

**Fix:** Generate `HowTo` JSON-LD per audience track from the existing `AUDIENCES` array.

---

#### 9. No `BreadcrumbList` JSON-LD anywhere

Breadcrumbs are a baseline rich-result enhancement. None defined.

---

#### 10. No `Service` schema for the IT specialisations

The 28+ specialisations (Azure, DevOps, Cybersecurity, Networking, Linux, Databases, Virtualisation, etc.) each warrant their own indexable page with `Service` schema. There is no per-category landing surface. A major missed long-tail opportunity for a marketplace.

---

#### 11. Static sitemap, no dynamic listings

`apps/web/src/app/sitemap.ts` lists 12 marketing pages. The marketplace has (or will have) hundreds of public task listings, contractor profiles, and company profiles that should be indexed individually. Without them, you compete with one homepage against marketplaces that have thousands of indexed pages.

**Fix:** Make `sitemap.ts` dynamic — fetch public tasks / contractors / companies from the API, paginate. Use `lastModified` from the DB row.

---

#### 12. No `llms.txt` / `ai.txt`

Emerging convention (Anthropic, OpenAI, Mistral now read these) for telling AI crawlers what content is canonical, what's preferred for retrieval, and what to skip. Equivalent of robots.txt for AI assistants.

**Fix:** Add `apps/web/public/llms.txt` describing the platform, key URLs, and crawl preferences.

---

### 🟢 P2 — Content depth and authority signals

#### 13. No glossary / definition pages

"What is an L2/L3 IT engineer?", "What is a fixed-scope IT engagement?", "What is video KYC?", "What is an ABN?" — these are exactly the queries AI assistants get asked. Currently nothing on talvexit.com answers them with a structured `DefinedTerm`.

#### 14. No `Article` schema on guide content

About, How-it-works, Privacy, Terms — none have `Article`/`WebPage` schema with `dateModified`, `author`, or `publisher`.

#### 15. No analytics / verification tags in `<head>`

No GSC, Bing Webmaster, GA, or Plausible verification meta tags. Performance can't be measured without these.

#### 16. Routes in `robots.ts` disallow list don't also emit `noindex` meta

`robots.ts` disallows `/customer/`, `/contractor/`, `/company/`, `/admin/` — but those routes don't *also* emit `<meta name="robots" content="noindex">`, which is the belt-and-braces requirement. Robots.txt is advisory; the meta tag is enforceable.

#### 17. Image alt text audit pending

Likely fine but worth a sweep across `apps/web/src/app/page.tsx` and other marketing pages.

---

## Proposed plan — three phases, three commits

### Phase 1 — fix the broken (single commit, ~2 hrs)

Mandatory before any other work has effect. Without a single canonical domain, all structured data feeds the wrong host.

1. Centralise the canonical site URL into one env-driven constant (`NEXT_PUBLIC_SITE_URL=https://talvexit.com`). Replace all three hardcoded domains in:
   - `apps/web/src/app/layout.tsx`
   - `apps/web/src/app/sitemap.ts`
   - `apps/web/src/app/robots.ts`
   - `apps/web/src/components/seo/JsonLd.tsx`
2. Render `OrganizationJsonLd` + `WebSiteJsonLd` from `layout.tsx` so they actually appear on every page.
3. Delete `SEOHead.tsx` and migrate its callers (`apps/web/src/app/page.tsx` and any others) to `metadata` exports + a working JSON-LD component.
4. Remove the fake `aggregateRating` from JSON-LD.
5. Rewrite the stale escrow/commission copy in metadata + JSON-LD descriptions to match the current direct-payment, subscription-funded model.
6. Either add a real `og-image.png` to `public/` or generate one dynamically via `app/opengraph-image.tsx`.
7. Add per-route `noindex` meta on `/customer/*`, `/contractor/*`, `/company/*`, `/admin/*` layouts.

### Phase 2 — AEO + structured data (single commit, ~2 hrs)

1. Add `FAQPage` JSON-LD to `/how-it-works`, generated from the existing 10-Q FAQ array.
2. Add `HowTo` JSON-LD for the 4 audience tracks (each set of steps).
3. Add `BreadcrumbList` to all marketing pages.
4. Create `apps/web/public/llms.txt` describing the platform, key URLs, and crawl preferences.
5. Make `sitemap.ts` dynamic — fetch public tasks/contractors/companies from the API, paginate.
6. Add `noindex` toggle to `metadata.robots` per page where appropriate.

### Phase 3 — content depth (incremental, multi-commit)

1. Per-specialisation landing page (`/services/azure`, `/services/devops`, etc.) with `Service` JSON-LD and SEO copy. ~28 pages.
2. Glossary page (`/glossary` + `/glossary/[term]`) with `DefinedTerm` schema.
3. `Article` schema on About / How-it-works / guides with `dateModified` propagated from git/CMS.
4. GSC + Bing verification meta tags in `layout.tsx` head.
5. `Article` JSON-LD on guides with a real author byline (E-E-A-T signal).

---

## Quick wins (no code from Claude needed)

- Submit `https://talvexit.com/sitemap.xml` to Google Search Console + Bing Webmaster Tools (after Phase 1 ships).
- Verify `talvexit.com` ownership in GSC.
- Add the `talvexit.com` property to Bing Webmaster Tools.
- Once Phase 1 ships, request reindexing of the homepage in GSC.

---

## Recommendation

**Ship Phase 1 today.** It's mostly a search-and-replace plus deleting one broken component, and without it Phases 2 and 3 feed the wrong canonical URL. Phase 2 is the highest-impact content work; expect to ship after Phase 1. Phase 3 is incremental — its sub-items can be picked off independently as content / copy decisions land.

---

## Appendix A — files referenced in this audit

```
apps/web/src/app/layout.tsx
apps/web/src/app/robots.ts
apps/web/src/app/sitemap.ts
apps/web/src/app/page.tsx
apps/web/src/app/how-it-works/page.tsx
apps/web/src/app/how-it-works/HowItWorksClient.tsx
apps/web/src/components/SEOHead.tsx                  ← delete
apps/web/src/components/seo/JsonLd.tsx               ← rewrite
apps/web/public/                                     ← add og-image, llms.txt
```

## Appendix B — env vars to add for Phase 1

```
# apps/web/.env.example, .env.local, .env.prod
NEXT_PUBLIC_SITE_URL=https://talvexit.com
```

Used by `layout.tsx`, `sitemap.ts`, `robots.ts`, and the JSON-LD components.



Update Todos
All three phases shipped:

Commit	Phase	What landed
12ad365	1 — fix the broken	Single canonical domain (talvexit.com) via lib/site.ts, JSON-LD wired into <head>, fake aggregateRating removed, stale escrow/commission copy rewritten, SEOHead.tsx deleted, dynamic opengraph-image.tsx added, noindex meta on all four private route groups, docs/seo-aeo-audit.md
ef4ac6c	2 — AEO surfaces	FAQPage + HowTo (×4 audience tracks) + BreadcrumbList on /how-it-works, Service schema for all 28 specialisations as an OfferCatalog on Organization, breadcrumbs on /about and /pricing, public/llms.txt, public/ai.txt, sitemap covers /services and /services/[slug]
8c0aa5b	3 — content depth	28 /services/[slug] pages from one template (statically generated, each with Service + BreadcrumbList), /glossary index + /glossary/[slug] × 10 terms with DefinedTerm schema, Article schema on About and How-it-works, env-driven GSC + Bing verification tokens, sitemap updated
Total surfaces now indexable
12 marketing routes
28 IT-specialisation landing pages
10 glossary term pages
1 glossary index
= 51 indexable URLs, up from 12, with rich structured data on each.
Deploy steps
After git pull:

Set in apps/web env (per environment):


NEXT_PUBLIC_SITE_URL=https://talvexit.com
GOOGLE_SITE_VERIFICATION=<from Google Search Console — leave unset until you have it>
BING_SITE_VERIFICATION=<from Bing Webmaster Tools — same>
NEXT_PUBLIC_SITE_URL is the only required one; the verification tokens just unlock the meta tags when populated.

docker compose -f docker-compose.prod.yml up -d --build web

Once live, in this order:

Google Search Console → Add property talvexit.com → grab the verification token → put in env → redeploy → request verification → submit https://talvexit.com/sitemap.xml
Bing Webmaster Tools → same flow
Request reindexing of the homepage in GSC
Open follow-ups (not in scope today)
Item	Effort
Make sitemap include real /tasks/[id], /contractors/[id], /companies/[id] rows from the API once those public listing endpoints are stable	half day
Convert Next.js to nonce-based CSP (drop 'unsafe-inline') — needs Next.js 15 upgrade	1 day
Replace the dynamic opengraph-image.tsx with a real-brand-asset version once the design is finalised	30 min
Add structured Q&A snippets on /services/[slug] per specialisation (e.g. "How much does an Azure migration cost?") for AEO long-tail	per-page content work
Add author bylines to glossary entries (E-E-A-T signal) once you have a named editor	small
