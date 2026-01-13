# GetPawsy

## Overview
GetPawsy is a production-ready Node.js + Express e-commerce webshop specializing in pet products. It integrates an LLM AI, CJ Dropshipping for automated fulfillment, and Stripe for secure payments. The platform aims to deliver a high-performance, SEO-friendly, and responsive e-commerce solution with advanced AI capabilities, automated dropshipping, product variants, an administrative dashboard, and multi-language support.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The system is built on Node.js and Express.js, utilizing 100% JSON file storage for all data.

### UI/UX Decisions
- Premium light theme with warm beige backgrounds and the Inter font family.
- "Pawsy" video mascot AI chatbot with emotional states, always visible.
- Mobile Chat Panel with bottom sheet positioning.
- Hero section with full-bleed layout.
- Product Detail Pages (PDP) feature image galleries, trust badges, stock status, and an enhanced sticky mobile add-to-cart bar.
- Admin theme uses a dark mode with specific accent and card colors.
- Product cards are fully clickable links.
- Enhanced product carousels with center-focus behavior.
- Responsive design with global text wrapping, responsive media defaults, and safe area utility classes.

### Technical Implementations
- **Product Management:** Supports dual-format CSV imports, batch image processing, CJ product integration, and an admin panel for product management.
- **Product Detail Page (PDP) System:** Dynamic product pages with multi-image galleries, variant selection, related products, customer reviews, and multi-language support.
- **Product Enrichment System:** AI (GPT-4o-mini) powered content generation for SEO.
- **Category Navigation System:** SEO-friendly category/subcategory browsing with auto-classification.
- **AI Integration:** LLM AI (OpenAI GPT-4o-mini) for contextual recommendations, function calling, and RAG, with full catalog knowledge indexing (Pawsy Knowledge Sync).
- **Internationalization (i18n):** Supports English, Dutch, German, French, and Spanish with UI translations and hreflang tags.
- **Dropshipping & Fulfillment:** Integrates with CJ Dropshipping API for automated order placement, tracking, and real-time inventory synchronization. Includes a CJ Import Validation Gate to ensure only pet products are imported and comprehensive variant normalization.
- **Payments:** Uses Stripe Checkout for secure processing.
- **SEO:** Dynamic meta tags, JSON-LD, XML sitemap generation, AI-driven multi-language SEO, and static HTML page generation, with an admin endpoint for bulk SEO generation.
- **Performance Optimization System:** Achieves high Lighthouse scores through gzip compression, HTTP caching, lazy loading, optimized API payloads, pagination, and responsive images.
- **Admin PRO System:** Dashboard with feature flags, job queue, product health scoring, and bulk fix tools. Includes a bulletproof authentication system.
- **Pet Eligibility System:** Scoring-based classification with an `ABSOLUTE_DENY` list and `PET_OVERRIDE_TERMS`, further enforced by **PET-ONLY LOCKDOWN V2.1** for strict pet-product validation across storefront routes.
- **Google Analytics 4 Integration:** Frontend tracking, GA4 Data API, and e-commerce event support.
- **Popularity & Best Sellers System:** Tracks product metrics for popularity scores.
- **Testing Infrastructure:** Playwright E2E tests and Vitest unit/API tests, including an E2E smoke test suite.
- **Image Proxy & Local Media System:** Server-side image proxy with caching, placeholder fallback, and local media mirroring. Images are converted to WEBP, managed with a budget, and processed on-demand, with robust sanitization for SSR.
- **Product Normalization System:** Centralized `productNormalize.js` for standardizing pet types, categories, validating products, and resolving images from multiple sources, including canonical image schema enforcement.
- **Pawsy Auto-Healer System V4:** AI-assisted self-healing system with audit trails, rollback, and alerting capabilities.
- **Catalog Sanity Checker (STAP 2.0):** Comprehensive catalog validation tool for CJ fields, image integrity, pricing, taxonomy, and duplicate detection.
- **Pricing Policy System (STAP 2.6):** Centralized pricing module with minimum margin floors, category-specific markups, and price cap handling.
- **Taxonomy Auto-Fixer (STAP 2.4):** Automated taxonomy repair for pet type detection, subcategory inference, and SEO slug deduplication.
- **Permissive Cart System:** Add-to-cart always works, with variant resolution and validation occurring at checkout/fulfillment.
- **Content Safety System:** Product safety module with NSFW-SHIELD, pet classification, and CSV-based exclusion.

### System Design Choices
- Robust image resolution handling and global image error handling.
- Enhanced server-side logging and error handling.
- Background job queue for AI reindexing.
- Multilingual content support with image text detection.
- SEO module uses JSON-backed storage.
- Homepage optimization for performance.
- SAFE-BOOT Architecture for environment variable-driven deployments.
- Production Reliability System with monitoring, media caching, and diagnostic endpoints.

## External Dependencies
- **Stripe:** Payment processing.
- **CJ Dropshipping API:** Product sourcing, order placement, and fulfillment.
- **OpenAI API:** LLM AI assistant and embeddings.
- **Outlook/Office365 SMTP:** Transactional emails.