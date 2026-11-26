#!/usr/bin/env node
/**
 * scripts/seo-enrich.mjs
 * Background Content Enrichment Pipeline with Gemini AI (Quota-Safe & US/EU Focused)
 *
 * Features:
 * - Prioritizes high-demand US/EU search queries (views, clean English, performer/JAV codes)
 * - Skips spam/link-in-bio junk titles so 100% of Gemini quota targets indexable US/EU demand
 * - Smaller reliable batch size (default 6) + 50s timeout + 2 RPM-safe concurrent lanes (< 13.5 RPM)
 * - Deterministic post-normalization (word-boundary trims, brand unification "| LustHub",
 *   automatic JAV code preservation, duplicate-title disambiguation) eliminating length rejections
 * - Automatic failover to gemini-3.1-flash-lite + 12-minute runtime watchdog
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  US_EU_CATEGORIES,
  cleanSourceTitle,
  extractJavCode,
  isSpamVideoTitle,
  slugify,
} from '../lib/schema.js';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const QUOTA_PATH = path.join(ROOT, 'data', 'enrich-quota-state.json');

// Environment Configuration (Default: 450 RPD safe buffer for 500 RPD limit on Flash Lite)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
const DAILY_REQUEST_LIMIT = parseInt(process.env.GEMINI_DAILY_REQUEST_LIMIT || '450', 10);
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.GEMINI_BATCH_SIZE || '6', 10), 1), 10);
const CONCURRENCY = Math.min(Math.max(parseInt(process.env.GEMINI_CONCURRENCY || '2', 10), 1), 3);
const REQUEST_DELAY_MS = parseInt(process.env.GEMINI_RATE_LIMIT_DELAY_MS || '4500', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '50000', 10);
const MAX_RUNTIME_MS = parseInt(process.env.MAX_RUNTIME_MS || '720000', 10); // 12 minutes max
const BRAND_SUFFIX = ' | LustHub';

const args = process.argv.slice(2);
const IS_MOCK = args.includes('--mock') || !GEMINI_API_KEY;
const IS_DRY_RUN = args.includes('--dry-run');
const limitArgIdx = args.indexOf('--limit');
const RUN_LIMIT = limitArgIdx !== -1 ? parseInt(args[limitArgIdx + 1], 10) : 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeSourceHash(video) {
  const payload = `${video.id}|${video.title}|${video.duration || video.length_sec || ''}|${video.keywords || ''}`;
  return createHash('md5').update(payload).digest('hex');
}

function calculateSimilarity(str1, str2) {
  const tokens1 = new Set(String(str1 || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const tokens2 = new Set(String(str2 || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union;
}

/**
 * Trims text cleanly at a word boundary without cutting mid-word.
 */
function trimWordBoundary(text, maxLen) {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (str.length <= maxLen) return str;
  let cut = str.slice(0, maxLen).trim();
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLen * 0.55)) {
    cut = cut.slice(0, lastSpace).trim();
  }
  return cut.replace(/[,;:\-–—]+$/, '').trim();
}

/**
 * Deterministically normalizes AI enrichment fields BEFORE quality gate validation:
 * - Unifies brand suffix to " | LustHub"
 * - Restores genuine JAV release codes (e.g. NSPS-826) if Gemini omitted them
 * - Word-boundary trims meta_description (115-160) & seo_title (28-65)
 * - Disambiguates exact title collisions cleanly
 */
export function normalizeEnrichmentItem(original, rawItem, seenTitles) {
  if (!rawItem || typeof rawItem !== 'object') return rawItem;
  const item = { ...rawItem };
  const origClean = cleanSourceTitle(original?.title || '');
  const javCode = extractJavCode(original?.title || origClean);

  // 1. Normalize seo_title
  let baseTitle = String(item.seo_title || '').replace(/\s+/g, ' ').trim();
  baseTitle = baseTitle.replace(/\s*(?:\||-|—)\s*(?:LustHub|lusthub\.my\.id)\s*$/i, '').trim();
  if (!baseTitle) baseTitle = origClean || 'HD Adult Video';

  // Preserve real JAV code when present in original title (normalize masked/hyphenless variants in place without duplicating)
  if (javCode) {
    baseTitle = baseTitle
      .replace(/\bFC2[-\s]?PPV[-\s]?(\d{5,8})\b/gi, 'FC2-PPV-$1')
      .replace(/\b([A-Z]\*[A-Z](?:\*[A-Z]){1,3})-(\d{3,5})\b/gi, (_, p, n) => `${p.replace(/\*/g, '').toUpperCase()}-${n}`);
    const compactBase = baseTitle.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const compactCode = javCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!compactBase.includes(compactCode)) {
      baseTitle = `${javCode} ${baseTitle}`;
    }
  }

  // Prevent bare-code-only titles
  if (/^[A-Z0-9\-_*]{3,14}$/i.test(baseTitle.replace(/\s+/g, ''))) {
    baseTitle = `${baseTitle} Full HD Video`;
  }

  const maxBaseLen = 62 - BRAND_SUFFIX.length; // 52 chars
  baseTitle = trimWordBoundary(baseTitle, maxBaseLen);

  // Pad very short titles safely so length >= 28
  if ((baseTitle.length + BRAND_SUFFIX.length) < 28) {
    const primaryTag = Array.isArray(item.tags) && item.tags[0]
      ? String(item.tags[0]).trim()
      : '';
    const pad = primaryTag ? ` — ${primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1)} Full HD` : ' — Full HD Stream';
    baseTitle = trimWordBoundary(`${baseTitle}${pad}`, maxBaseLen);
  }

  let seoTitle = `${baseTitle}${BRAND_SUFFIX}`;
  if (seenTitles && seenTitles.has(seoTitle.toLowerCase())) {
    const tagHint = Array.isArray(item.tags) && item.tags[0]
      ? String(item.tags[0]).trim().replace(/^./, c => c.toUpperCase())
      : '';
    const candidates = [
      `${trimWordBoundary(baseTitle, maxBaseLen - 8)} Full HD${BRAND_SUFFIX}`,
      tagHint ? `${trimWordBoundary(baseTitle, maxBaseLen - tagHint.length - 3)} (${tagHint})${BRAND_SUFFIX}` : '',
      `${trimWordBoundary(baseTitle, maxBaseLen - 6)} [${String(original?.id || '').slice(-4)}]${BRAND_SUFFIX}`,
    ].filter(Boolean);
    for (const c of candidates) {
      if (c.length >= 28 && c.length <= 65 && !seenTitles.has(c.toLowerCase())) {
        seoTitle = c;
        break;
      }
    }
  }
  item.seo_title = seoTitle;

  // 2. Normalize meta_description into clean 115-160 char window
  let desc = String(item.meta_description || '').replace(/\s+/g, ' ').trim();
  if (desc.length > 158) {
    const trimmed = trimWordBoundary(desc, 156);
    desc = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  } else if (desc.length >= 65 && desc.length < 115) {
    const baseSentence = /[.!?]$/.test(desc) ? desc : `${desc}.`;
    const additions = [
      ' Stream free in 1080p HD on lusthub.my.id with instant mobile playback and zero signup.',
      ' Watch free in full HD on lusthub.my.id without registration.',
      ' Free instant HD playback on lusthub.my.id.',
    ];
    for (const add of additions) {
      const merged = `${baseSentence}${add}`;
      if (merged.length >= 115 && merged.length <= 160) {
        desc = merged;
        break;
      }
    }
    if (desc.length < 115 || desc.length > 160) {
      desc = trimWordBoundary(`${baseSentence} Watch free in 1080p HD on lusthub.my.id with zero signup.`, 156);
      if (!/[.!?]$/.test(desc)) desc += '.';
    }
  }
  item.meta_description = desc;

  // 3. Normalize tags, highlights, faq
  if (Array.isArray(item.tags)) {
    const cleanTags = [];
    const seenT = new Set();
    for (const t of item.tags) {
      const clean = String(t || '').trim().toLowerCase();
      if (!clean || clean.length > 32 || seenT.has(clean)) continue;
      seenT.add(clean);
      cleanTags.push(clean);
      if (cleanTags.length >= 8) break;
    }
    item.tags = cleanTags;
  }

  if (Array.isArray(item.highlights)) {
    item.highlights = item.highlights
      .map(h => String(h || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  if (Array.isArray(item.faq)) {
    item.faq = item.faq
      .map(f => ({
        question: String(f?.question || '').replace(/\s+/g, ' ').trim(),
        answer: String(f?.answer || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter(f => f.question.length >= 5 && f.answer.length >= 10)
      .slice(0, 4);
  }

  return item;
}

/**
 * Computes US/EU curated categories that currently have fewer than 24 alive enriched videos
 * so Gemini prioritizes filling deficit hubs (e.g. czech, 4k-uhd, italian, german, french, spanish).
 */
function buildDeficitHubMatchers(dbVideos) {
  const counts = new Map(US_EU_CATEGORIES.map(s => [s, 0]));
  const matchers = US_EU_CATEGORIES.map(s => [s, new RegExp(`\\b${s.replace(/-/g, '\\s+')}\\b`, 'i')]);
  for (const v of Object.values(dbVideos || {})) {
    if (!v || v.status !== 'enriched' || !v.model || v.model === 'mock-enricher') continue;
    const hay = `${v.title || ''} ${(Array.isArray(v.tags) ? v.tags.join(' ') : '')}`;
    for (const [slug, re] of matchers) {
      if (re.test(hay)) counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }
  return matchers.filter(([slug]) => (counts.get(slug) || 0) < 24);
}

/**
 * Scores a catalog video for enrichment queue prioritization targeting US/EU search demand.
 */
function scoreVideoPriority(video, deficitMatchers = []) {
  const title = cleanSourceTitle(video.title || '');
  if (isSpamVideoTitle(title)) return -999;

  const combined = `${title} ${video.keywords || ''}`;
  let score = Math.log10((Number(video.views) || 0) + 1) * 20;

  // Favor clean ASCII/English titles & high-demand US/EU search patterns
  if (title && !/[^\x00-\x7F]/.test(title)) score += 25;
  if (extractJavCode(title) && title.length >= 16) score += 22;
  if (/\b(milf|blonde|brunette|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|creampie|european|british|german|french|spanish|italian|czech|russian|stepmom|stepsis|massage|casting|squirt|deepthroat|bbw|college|petite|homemade|blowjob|big tits|big ass|pawg|hotwife|cuckold|pornstar|hardcore|cumshot|group sex)\b/i.test(combined)) {
    score += 26;
  }
  // Extra boost for European languages/countries so EU localized hubs have deep inventory
  if (/\b(european|british|german|deutsch|french|francaise|spanish|espanol|italian|italiana|czech|prague|berlin|paris|london|madrid|rome)\b/i.test(combined)) {
    score += 14;
  }
  // Deficit-hub boost (+45) so underrepresented US/EU curated hubs quickly reach 24+ AI videos
  for (const [, re] of deficitMatchers) {
    if (re.test(combined)) {
      score += 45;
      break;
    }
  }
  if (video.thumbnail && video.thumbnail.includes('_360')) score += 10;
  if (video.keywords) score += 10;

  if (title.length < 12) score -= 35;
  if (/\b(indo|bokep|mertua|mantu|ngewe|memek|kontol|colmek|tamil|hindi|bhabhi|desi|mallu)\b/i.test(combined)) score -= 55;
  return score;
}

/**
 * Validates normalized content against SEO quality gate rules.
 */
export function validateEnrichment(original, enriched, seenTitles) {
  if (!enriched || typeof enriched !== 'object') {
    return { valid: false, reason: 'Enrichment payload is not an object' };
  }

  const title = String(enriched.seo_title || '').trim();
  if (!title || title.length < 28 || title.length > 65) {
    return { valid: false, reason: `Invalid title length (${title.length} chars, must be 28-65)` };
  }

  const bareTitle = title.replace(/\s*\|\s*(LustHub|lusthub\.my\.id)$/i, '').trim();
  if (/^[A-Z0-9\-_*]{3,14}$/i.test(bareTitle.replace(/\s+/g, ''))) {
    return { valid: false, reason: 'Rejected bare code-only seo_title without descriptive context' };
  }

  if (seenTitles && seenTitles.has(title.toLowerCase())) {
    return { valid: false, reason: `Duplicate seo_title collided with existing page: "${title}"` };
  }

  const desc = String(enriched.meta_description || '').trim();
  if (desc.length < 115 || desc.length > 160) {
    return { valid: false, reason: `Invalid meta_description length (${desc.length} chars, must be 115-160)` };
  }

  const summary = String(enriched.summary || '').trim();
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (summary.length < 140 || sentences.length < 2 || sentences.length > 7) {
    return { valid: false, reason: `Summary too short or invalid sentence count (${summary.length} chars, ${sentences.length} sentences)` };
  }

  if (summary.includes('verified amateur releases and zero mandatory signups needed')) {
    return { valid: false, reason: 'Rejected boilerplate mock text' };
  }

  const sim = calculateSimilarity(original.title, summary);
  if (sim > 0.75) {
    return { valid: false, reason: `Summary is too similar to original title (similarity ${sim.toFixed(2)} > 0.75)` };
  }

  if (!Array.isArray(enriched.highlights) || enriched.highlights.length < 3 || enriched.highlights.length > 5) {
    return { valid: false, reason: 'Highlights count must be between 3 and 5' };
  }

  if (!Array.isArray(enriched.tags) || enriched.tags.length < 3 || enriched.tags.length > 8) {
    return { valid: false, reason: 'Tags count must be between 3 and 8' };
  }

  if (!Array.isArray(enriched.faq) || enriched.faq.length < 2 || enriched.faq.length > 4) {
    return { valid: false, reason: 'FAQ count must be between 2 and 4' };
  }
  for (const item of enriched.faq) {
    if (!item.question || !item.answer || item.question.length < 5 || item.answer.length < 10) {
      return { valid: false, reason: 'Invalid FAQ item format or empty answer' };
    }
  }

  return { valid: true };
}

async function loadQuotaState() {
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const raw = await readFile(QUOTA_PATH, 'utf8');
    const state = JSON.parse(raw);
    if (state.date === todayStr) return state;
  } catch {}
  return { date: todayStr, requestsToday: 0 };
}

async function saveQuotaState(state) {
  if (IS_DRY_RUN) return;
  await writeFile(QUOTA_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function generateMockEnrichment(video) {
  const cleanTitle = (cleanSourceTitle(video.title) || 'HD Adult Video').slice(0, 38).trim();
  const durMin = video.duration ? `${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, '0')}` : '5:00';
  return {
    id: video.id,
    seo_title: `${cleanTitle} Full HD Stream | LustHub`,
    meta_description: `Stream ${cleanTitle} free in 1080p HD on lusthub.my.id. Instant mobile playback with fast edge loading and zero account signup.`,
    summary: `Watch ${cleanTitle} in high-definition streaming with clear playback across desktop and mobile browsers on lusthub.my.id. This release runs ${durMin} and highlights natural scene chemistry without forced software downloads.`,
    highlights: [
      'Full 1080p high-bitrate browser playback',
      `Full scene runtime (${durMin})`,
      'Instant mobile streaming with no registration gate',
    ],
    tags: ['amateur', 'homemade', 'hd', 'trending'],
    faq: [
      {
        question: `Can I stream ${cleanTitle} on mobile without an app?`,
        answer: 'Yes, it streams instantly in Safari, Chrome, and Firefox without app downloads.',
      },
      {
        question: 'Is signup required to watch this full HD video?',
        answer: 'No registration, login, or subscription is required on lusthub.my.id.',
      },
    ],
  };
}

/**
 * Shared RPM-safe dispatch gate so concurrent worker lanes never burst past Gemini free-tier RPM.
 */
let nextDispatchAt = 0;
async function acquireRateSlot() {
  if (IS_MOCK) return;
  const now = Date.now();
  const waitMs = Math.max(0, nextDispatchAt - now);
  nextDispatchAt = Math.max(now, nextDispatchAt) + REQUEST_DELAY_MS;
  if (waitMs > 0) await sleep(waitMs);
}

async function callGeminiBatch(batch) {
  if (IS_MOCK) {
    await sleep(120);
    return { results: batch.map(generateMockEnrichment), model: 'mock-enricher' };
  }

  const prompt = `You are a senior US & European adult video SEO editor writing for lusthub.my.id.
Generate rich, unique, search-friendly US/EU English metadata for the following ${batch.length} videos.

STRICT RULES:
1. Use ONLY facts present in each video's metadata (title, duration_sec, keywords). NEVER invent performer names, studios, or unverified claims.
2. Clean the title by removing random 4-character trailing uploader hashes (e.g., O9xf, Dt3r, Aac1, 74ma, Iktb, T0iq). ALWAYS preserve real JAV codes (like NSPS-826, SONE-335) and real performer names verbatim inside "seo_title". If input is only a bare code (e.g. "MIDA-857"), include descriptive genre/category wording from tags so "seo_title" is NOT a bare code.
3. Translate any non-English or gibberish title context accurately into natural US/EU English while keeping recognizable keywords/performers/JAV codes intact.
4. "seo_title" MUST be 32 to 62 characters total, MUST be unique across this batch, MUST end on a complete word (NEVER truncate mid-word!), and MUST end with " | LustHub".
5. "meta_description" MUST be strictly 125 to 152 characters total, natural persuasive US/EU English, complete sentence.
6. "summary": 4 to 6 rich, unique informative sentences split into 2 concise paragraphs separated by "\n\n" (280 to 520 characters total) describing the scene premise, visual style, pacing, and mobile/HD viewing experience without repeating the input title verbatim.
7. "highlights": 4 specific, non-generic bullet highlights tied to the video's genre, runtime, and presentation.
8. "tags": 4 to 6 clean lowercase English category/topic keywords matching US/EU search habits (e.g. milf, blonde, brunette, amateur, pov, onlyfans, anal, hardcore, jav).
9. "faq": 3 natural search-intent Q&As matching how users search on Google/Bing/Perplexity.
10. OUTPUT FORMAT: Respond strictly with a JSON array matching the exact order of input videos:
[
  {
    "id": "video_id",
    "seo_title": "Complete Title Here | LustHub",
    "meta_description": "125-152 char natural description.",
    "summary": "Paragraph 1 (2-3 sentences).\n\nParagraph 2 (2-3 sentences), totaling 280-520 characters.",
    "highlights": ["Point 1", "Point 2", "Point 3", "Point 4"],
    "tags": ["tag1", "tag2", "tag3", "tag4"],
    "faq": [
      { "question": "Question 1?", "answer": "Answer 1." },
      { "question": "Question 2?", "answer": "Answer 2." },
      { "question": "Question 3?", "answer": "Answer 3." }
    ]
  }
]

INPUT VIDEOS:
${JSON.stringify(batch.map(v => ({
    id: v.id,
    title: cleanSourceTitle(v.title) || v.title,
    duration_sec: v.duration || v.length_sec || 0,
    tags: v.keywords || '',
  })), null, 2)}`;

  let attempts = 0;
  let activeModel = GEMINI_MODEL;

  while (attempts < 3) {
    attempts++;
    await acquireRateSlot();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      });

      if (res.status === 429 || res.status === 503) {
        const waitMs = Math.pow(2, attempts) * 3000;
        console.warn(`[${res.status} ${res.status === 429 ? 'Rate Limit' : 'Model High Demand'}] Waiting ${waitMs / 1000}s (attempt ${attempts}/3 on ${activeModel})...`);

        if (res.status === 503 && activeModel !== GEMINI_FALLBACK_MODEL && attempts >= 2) {
          activeModel = GEMINI_FALLBACK_MODEL;
          console.warn(`[503 Failover] Switching active model to ${activeModel} for this batch...`);
        }

        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Empty response from Gemini API');
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed)) throw new Error('Gemini API response was not a JSON array');
      return { results: parsed, model: activeModel };
    } catch (err) {
      console.warn(`[Attempt ${attempts}/3 failed] ${err.name === 'TimeoutError' ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : err.message}`);
      if (attempts >= 3) throw err;

      if (activeModel !== GEMINI_FALLBACK_MODEL && attempts >= 2) {
        activeModel = GEMINI_FALLBACK_MODEL;
        console.warn(`[Failover] Switching active model to ${activeModel} on final retry...`);
      }

      await sleep(3000 * attempts);
    }
  }

  throw new Error('Failed after 3 attempts');
}

async function main() {
  console.log('=== GEMINI CONTENT ENRICHMENT PIPELINE (US/EU HIGH-THROUGHPUT) ===');
  console.log(`Mode: ${IS_MOCK ? 'MOCK / OFFLINE' : `LIVE (Model: ${GEMINI_MODEL})`}${IS_DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Batch Size: ${BATCH_SIZE} | Concurrency: ${CONCURRENCY} | Timeout: ${REQUEST_TIMEOUT_MS / 1000}s | Limit: ${RUN_LIMIT}`);

  const startTime = Date.now();
  const quota = await loadQuotaState();
  console.log(`Quota used today: ${quota.requestsToday} / ${DAILY_REQUEST_LIMIT} requests`);
  if (quota.requestsToday >= DAILY_REQUEST_LIMIT && !IS_MOCK) {
    console.log('Daily request limit reached. Exiting gracefully until tomorrow.');
    return;
  }

  let sitemapState = { videos: [] };
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    sitemapState = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load sitemap-state.json:', err.message);
    process.exit(1);
  }

  let db = { version: 1, updated_at: new Date().toISOString(), videos: {} };
  try {
    const rawDb = await readFile(ENRICHED_PATH, 'utf8');
    db = JSON.parse(rawDb);
    if (!db.videos) db.videos = {};
  } catch {}

  const seenTitles = new Set(
    Object.values(db.videos)
      .filter(v => v && v.status === 'enriched' && v.model !== 'mock-enricher' && v.seo_title)
      .map(v => String(v.seo_title).trim().toLowerCase())
  );

  const deficitMatchers = buildDeficitHubMatchers(db.videos);
  console.log(`US/EU hubs under 24 AI videos receiving priority boost: ${deficitMatchers.length} (${deficitMatchers.map(([s]) => s).slice(0, 12).join(', ')})`);

  const queue = [...sitemapState.videos]
    .filter(v => {
      if (isSpamVideoTitle(v.title)) return false;
      const existing = db.videos[v.id];
      if (!existing) return true;
      if (existing.status === 'pending' || existing.model === 'mock-enricher') return true;
      if (existing.status === 'failed' && (existing.attempts || 0) < 6) return true;
      if (existing.status === 'rejected' && /Invalid (?:meta_description|title) length/i.test(existing.rejection_reason || '')) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const diff = scoreVideoPriority(b, deficitMatchers) - scoreVideoPriority(a, deficitMatchers);
      if (Math.abs(diff) > 0.01) return diff;
      return (b.published || b.added || '').localeCompare(a.published || a.added || '');
    })
    .slice(0, RUN_LIMIT);

  console.log(`Queue size: ${queue.length} high-priority non-spam videos ready to enrich.`);
  if (queue.length === 0) {
    console.log('All queued videos are already enriched with real AI metadata!');
    return;
  }

  const batches = [];
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    batches.push({ index: batches.length + 1, items: queue.slice(i, i + BATCH_SIZE) });
  }

  let cursor = 0;
  let processedCount = 0;
  let successCount = 0;
  let rejectedCount = 0;
  let stopRequested = false;
  let flushChain = Promise.resolve();

  function persistState() {
    if (IS_DRY_RUN) return Promise.resolve();
    flushChain = flushChain.then(async () => {
      db.updated_at = new Date().toISOString();
      await writeFile(ENRICHED_PATH, JSON.stringify(db, null, 2), 'utf8');
      await saveQuotaState(quota);
    });
    return flushChain;
  }

  async function worker(laneId) {
    while (!stopRequested) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        if (!stopRequested) console.log('Runtime safety threshold (12m) reached. Stopping cleanly.');
        stopRequested = true;
        break;
      }
      if (quota.requestsToday >= DAILY_REQUEST_LIMIT && !IS_MOCK) {
        if (!stopRequested) console.log('Daily request limit reached during execution. Stopping cleanly.');
        stopRequested = true;
        break;
      }

      const nextBatch = batches[cursor++];
      if (!nextBatch) break;

      quota.requestsToday++;
      console.log(`\n[Lane ${laneId}] Processing batch ${nextBatch.index}/${batches.length} (${nextBatch.items.length} videos)...`);

      try {
        const { results, model: usedModel } = await callGeminiBatch(nextBatch.items);

        results.forEach((rawItem, idx) => {
          const orig = nextBatch.items.find(b => b.id === rawItem.id) || nextBatch.items[idx] || nextBatch.items[0];
          const hash = computeSourceHash(orig);
          const item = normalizeEnrichmentItem(orig, rawItem, seenTitles);
          const validation = validateEnrichment(orig, item, seenTitles);

          if (validation.valid) {
            seenTitles.add(String(item.seo_title).trim().toLowerCase());
            db.videos[orig.id] = {
              video_id: orig.id,
              title: cleanSourceTitle(orig.title) || orig.title || item.seo_title,
              slug: orig.slug || slugify(orig.title, 80, orig.id),
              thumbnail: orig.thumbnail || '',
              source_hash: hash,
              seo_title: item.seo_title,
              meta_description: item.meta_description,
              summary: item.summary,
              highlights: item.highlights,
              tags: item.tags,
              faq: item.faq,
              status: 'enriched',
              model: usedModel,
              generated_at: new Date().toISOString(),
              attempts: (db.videos[orig.id]?.attempts || 0) + 1,
            };
            successCount++;
            console.log(`  ✓ [Enriched] ID: ${orig.id} | "${item.seo_title}"`);
          } else {
            db.videos[orig.id] = {
              video_id: orig.id,
              source_hash: hash,
              status: 'rejected',
              rejection_reason: validation.reason,
              model: usedModel,
              generated_at: new Date().toISOString(),
              attempts: (db.videos[orig.id]?.attempts || 0) + 1,
            };
            rejectedCount++;
            console.warn(`  ✗ [Rejected] ID: ${orig.id}: ${validation.reason}`);
          }
          processedCount++;
        });

        await persistState();
      } catch (err) {
        console.error(`[Lane ${laneId}] Batch ${nextBatch.index} failed:`, err.message);
        nextBatch.items.forEach(v => {
          db.videos[v.id] = {
            video_id: v.id,
            status: 'failed',
            rejection_reason: err.message,
            attempts: (db.videos[v.id]?.attempts || 0) + 1,
          };
        });
        await persistState();
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, (_, idx) => worker(idx + 1));
  await Promise.all(workers);
  await flushChain;

  console.log('\n--- Pipeline Run Summary ---');
  console.log(`Processed: ${processedCount} videos`);
  console.log(`Successfully Enriched: ${successCount}`);
  console.log(`Rejected: ${rejectedCount}`);
  console.log(`Remaining quota today: ${Math.max(0, DAILY_REQUEST_LIMIT - quota.requestsToday)} requests`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(console.error);
}
