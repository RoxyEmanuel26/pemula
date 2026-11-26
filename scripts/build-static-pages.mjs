#!/usr/bin/env node
/**
 * scripts/build-static-pages.mjs
 * Unifies static compliance & utility pages (404, about, howto, contact, dmca, privacy, terms)
 * onto the V2.0 Cinema Obsidian design system via lib/ui-shell.js.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BASE_URL, SITE_DOMAIN, US_EU_CATEGORIES, formatCategoryName, escapeHtml, createBreadcrumbSchema } from '../lib/schema.js';
import { renderPageShell } from '../lib/ui-shell.js';

const ROOT = process.cwd();

const PAGES = [
  {
    file: '404.html',
    url: '/404',
    title: 'Page Not Found (404) | LustHub',
    description: `The page you requested could not be found on ${SITE_DOMAIN}. Browse live verified US, European, and JAV 18+ HD hubs.`,
    robots: 'noindex, follow',
    h1: 'Page Not Found (404)',
    sections: [
      {
        heading: 'Explore Live Verified HD Categories',
        body: `<p>The requested URL may have been removed or moved. Jump straight back into our fastest-loading US, European, and Japanese JAV video collections:</p>
        <div class="lh-dir-pills" style="margin-top:14px;">${US_EU_CATEGORIES.slice(0, 20).map(s => `<a href="/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(formatCategoryName(s))}</a>`).join('')}</div>`,
      },
    ],
  },
  {
    file: 'about.html',
    url: '/about',
    title: 'About LustHub — Fast 18+ Global HD Streaming Platform',
    description: `Learn about ${SITE_DOMAIN}, our mobile-first 1080p/4K streaming architecture, RTA 18+ compliance, and automated daily US & European curation.`,
    robots: 'index, follow',
    h1: 'About LustHub',
    sections: [
      {
        heading: 'Built for Speed, Privacy & Zero-Friction Playback',
        body: `<p>${SITE_DOMAIN} is an edge-cached 18+ adult discovery and streaming gallery designed for North American, European, and global audiences. Every watch page and category hub loads without mandatory accounts, invasive app installs, or software downloads.</p>
        <p>Our automated twice-daily indexing and live liveness verification continuously curate high-definition 1080p and 4K releases across 72+ international niches and dedicated European language portals.</p>`,
      },
      {
        heading: '18+ RTA Compliance & Safety',
        body: `<p>Every route on ${SITE_DOMAIN} carries the Restricted To Adults (<code>RTA-5042-1996-1400-1577-RTA</code>) metadata and HTTP header to support parental filtering tools worldwide. Strictly adults 18+ only.</p>`,
      },
    ],
  },
  {
    file: 'howto.html',
    url: '/howto',
    title: 'How to Watch HD Videos Smoothly on Mobile & Desktop | LustHub',
    description: `Quick guide to streaming 1080p & 4K videos, using Theater Mode, saving Favorites without login, and keyboard shortcuts on ${SITE_DOMAIN}.`,
    robots: 'index, follow',
    h1: 'How to Watch & Save Videos on LustHub',
    sections: [
      {
        heading: 'Instant HTML5 Playback (Zero Apps Needed)',
        body: `<p>Open any video card and click the play button inside the 16:9 preview frame. Streams adapt automatically to your connection speed in Chrome, Safari, Firefox, and Edge across iOS, Android, and desktop.</p>`,
      },
      {
        heading: 'Theater Mode, Favorites & Keyboard Shortcuts',
        body: `<p><strong>Save Favorites Without Signups:</strong> Click the bookmark icon on any card or watch page to store favorites locally in your browser.</p>
        <p><strong>Keyboard Shortcuts:</strong> Press <code>/</code> anywhere to jump to Command Search, <code>T</code> on a watch page to toggle wide Theater Mode, and <code>Esc</code> to close search menus.</p>`,
      },
    ],
  },
  {
    file: 'contact.html',
    url: '/contact',
    title: 'Contact Support & Administration | LustHub',
    description: `Contact ${SITE_DOMAIN} administration for technical support, partnership inquiries, content compliance, or DMCA requests.`,
    robots: 'index, follow',
    h1: 'Contact LustHub',
    sections: [
      {
        heading: 'General & Compliance Inquiries',
        body: `<p>For copyright takedowns, broken stream reports, technical questions, or compliance notices, email our administration team directly at <a href="mailto:admin@${SITE_DOMAIN}" style="color:var(--accent);font-weight:700;">admin@${SITE_DOMAIN}</a>.</p>
        <p>For formal copyright claims, please follow the checklist on our <a href="/dmca" style="color:var(--accent);font-weight:700;">DMCA Policy page</a> for fastest turnaround (typically within 24–48 hours).</p>`,
      },
    ],
  },
  {
    file: 'dmca.html',
    url: '/dmca',
    title: 'DMCA & Copyright Takedown Policy | LustHub',
    description: `Read the official DMCA notice and rapid copyright takedown procedure for ${SITE_DOMAIN}.`,
    robots: 'index, follow',
    h1: 'DMCA & Copyright Notice',
    sections: [
      {
        heading: 'Third-Party Embedded Media Notice',
        body: `<p>${SITE_DOMAIN} operates as an index and aggregation gallery of publicly available third-party embedded video streams. We do not host, upload, or store video media files on our servers.</p>`,
      },
      {
        heading: 'Submitting a Takedown Notice',
        body: `<p>If you own copyrighted material and wish to have a specific listing removed from ${SITE_DOMAIN}, please email <a href="mailto:admin@${SITE_DOMAIN}" style="color:var(--accent);font-weight:700;">admin@${SITE_DOMAIN}</a> with: (1) the exact URL(s) on ${SITE_DOMAIN}, (2) proof of copyright ownership or authorization, and (3) valid contact information. Verified notices are processed promptly.</p>`,
      },
    ],
  },
  {
    file: 'privacy.html',
    url: '/privacy',
    title: 'Privacy Policy & EU GDPR Transparency | LustHub',
    description: `Privacy policy, local browser storage explanation, GDPR/EU transparency, and third-party ad network disclosures for ${SITE_DOMAIN}.`,
    robots: 'index, follow',
    h1: 'Privacy Policy',
    sections: [
      {
        heading: 'Zero Mandatory Accounts & Local Preferences',
        body: `<p>${SITE_DOMAIN} does not require account registration, names, emails, or payment cards to browse or stream content. Features like Dark/Light theme, Favorites, and Watch History are stored strictly inside your own browser's <code>localStorage</code> and cookies and can be cleared anytime.</p>`,
      },
      {
        heading: 'Cookies, Analytics & Third-Party Advertising',
        body: `<p>To keep streaming 100% free, we work with third-party advertising networks and privacy-focused performance analytics (such as Cloudflare Web Analytics). Third-party ad scripts and embedded video players may set cookies according to their respective privacy policies. European Economic Area (EEA/UK) visitors retain full GDPR rights to control cookies via their browser settings.</p>`,
      },
    ],
  },
  {
    file: 'terms.html',
    url: '/terms',
    title: 'Terms of Service & 18+ Age Compliance | LustHub',
    description: `Terms of service, 18+ adult age requirement, RTA compliance, and acceptable use rules for ${SITE_DOMAIN}.`,
    robots: 'index, follow',
    h1: 'Terms of Service',
    sections: [
      {
        heading: 'Adults 18+ Only (Strict Age Compliance)',
        body: `<p>By accessing ${SITE_DOMAIN}, you affirm that you are at least 18 years old (or the legal age of majority in your jurisdiction) and that viewing adult material is legal where you reside. We actively label all pages with the RTA (<code>RTA-5042-1996-1400-1577-RTA</code>) standard to assist parental blocking software.</p>`,
      },
      {
        heading: 'Acceptable Use & Third-Party Content',
        body: `<p>All embedded streams remain the sole responsibility of their respective upstream hosts and creators. Automated scraping, abusive bot traffic, or attempts to disrupt platform availability are prohibited.</p>`,
      },
    ],
  },
];

async function main() {
  for (const page of PAGES) {
    const canonicalUrl = `${BASE_URL}${page.url}`;
    const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">${escapeHtml(page.h1)}</span>
        </nav>
        <article class="lh-section-card" style="margin-top:0;max-width:900px;">
          <h1 class="lh-page-title" style="margin-bottom:16px;">${escapeHtml(page.h1)}</h1>
          ${page.sections.map(s => `<div style="margin-top:20px;"><h2>${escapeHtml(s.heading)}</h2>${s.body}</div>`).join('\n          ')}
        </article>`;

    const html = renderPageShell({
      lang: 'en',
      title: page.title,
      description: page.description,
      canonicalUrl,
      robots: page.robots,
      schemas: [createBreadcrumbSchema([{ name: 'Home', url: '/' }, { name: page.h1, url: page.url }])],
      showHeaderAd: false,
      showBottomAd: false,
      bodyHtml,
    });

    await writeFile(path.join(ROOT, page.file), html, 'utf8');
  }
  console.log(`Rebuilt ${PAGES.length} V2.0 static pages (${PAGES.map(p => p.file).join(', ')}).`);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
