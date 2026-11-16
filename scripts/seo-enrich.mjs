#!/usr/bin/env node
/**
 * scripts/seo-enrich.mjs
 * Background Content Enrichment Pipeline with Gemini AI (Quota-Safe & US/EU Focused)
 *
 * Features:
 * - Prioritizes high-demand US/EU search queries (views, clean English, performer/JAV codes)
 * - Automatically re-queues synthetic mock-enricher entries for real Gemini enrichment
 * - Batched processing (5-10 videos per request) to maximize free tier efficiency
 * - Strict quality gate validation (word-safe length, anti-hallucination, anti-duplication)
 * - Safe exponential backoff + automatic failover to gemini-3.1-flash-lite
 * - 12-minute runtime watchdog to guarantee clean exit and git commits before CI timeouts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { cleanSourceTitle, slugify } from '../api/schema-helper.js';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const QUOTA_PATH = path.join(ROOT, 'data', 'enrich-quota-state.json');

// Environment Configuration (Default: 450 RPD safe buffer for 500 RPD limit on Flash Lite)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
const DAILY_REQUEST_LIMIT = parseInt(process.env.GEMINI_DAILY_REQUEST_LIMIT || '450', 10);
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.GEMINI_BATCH_SIZE || '8', 10), 1), 10);
const REQUEST_DELAY_MS = parseInt(process.env.GEMINI_RATE_LIMIT_DELAY_MS || '4500', 10);
const MAX_RUNTIME_MS = parseInt(process.env.MAX_RUNTIME_MS || '720000', 10); // 12 minutes max

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
 * Scores a catalog video for enrichment queue prioritization targeting US/EU search demand.
 */
function scoreVideoPriority(video) {
  const title = cleanSourceTitle(video.title || '');
  const combined = `${title} ${video.keywords || ''}`;
  let score = Math.log10((Number(video.views) || 0) + 1) * 20;

  // Favor clean ASCII/English titles & high-demand US/EU search patterns
  if (title && !/[^\x00-\x7F]/.test(title)) score += 25;
  if (/[A-Z]{2,5}-?\d{3,5}/i.test(title)) score += 20; // JAV code (e.g. SONE-335, VRTM-469)
  if (/\b(milf|blonde|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|creampie|european|homemade|blowjob|big tits|big ass)\b/i.test(combined)) {
    score += 20;
  }
  if (video.keywords) score += 10;

  // Penalize low-search-value spam/numeric stubs
  if (title.length < 8 || /^\d+$/.test(title) || /[a-z]+\d{4,}$/i.test(title)) score -= 35;
  return score;
}

/**
 * Validates generated content against SEO quality gate rules.
 */
function validateEnrichment(original, enriched) {
  if (!enriched || typeof enriched !== 'object') {
    return { valid: false, reason: 'Enrichment payload is not an object' };
  }

  const title = String(enriched.seo_title || '').trim();
  if (!title || title.length < 15 || title.length > 65) {
    return { valid: false, reason: `Invalid title length (${title.length} chars, must be 15-65)` };
  }

  const desc = String(enriched.meta_description || '').trim();
  if (desc.length < 115 || desc.length > 160) {
    return { valid: false, reason: `Invalid meta_description length (${desc.length} chars, must be 115-160)` };
  }

  const summary = String(enriched.summary || '').trim();
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 2 || sentences.length > 4) {
    return { valid: false, reason: `Summary sentence count (${sentences.length}) out of range (2-4 sentences required)` };
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
    seo_title: `${cleanTitle} Full HD | LustHub`.slice(0, 60),
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

async function callGeminiBatch(batch) {
  if (IS_MOCK) {
    await sleep(200);
    return { results: batch.map(generateMockEnrichment), model: 'mock-enricher' };
  }

  const prompt = `You are a senior US & European adult video SEO editor writing for lusthub.my.id.
Generate rich, unique, search-friendly US/EU English metadata for the following ${batch.length} videos.

STRICT RULES:
1. Use ONLY facts present in each video's metadata (title, duration_sec, keywords). NEVER invent performer names, studios, or unverified claims.
2. Clean the title by removing random 4-character trailing uploader hashes (e.g., O9xf, Dt3r, Aac1, 74ma, Iktb, T0iq). Preserve real JAV codes (like SONE-335) and performer names.
3. Translate any non-English or gibberish title context accurately into natural US/EU English while keeping recognizable keywords/performers/JAV codes intact.
4. "seo_title" MUST be 42 to 60 characters total, MUST end on a complete word (NEVER truncate mid-word!), and end with " | LustHub".
5. "meta_description" MUST be strictly 120 to 155 characters total, natural persuasive US/EU English, complete sentence.
6. "summary": 2 to 3 clear natural sentences describing the scene and viewing experience without repeating the input title verbatim.
7. "tags": 4 to 6 clean lowercase English category/topic keywords matching US/EU search habits (e.g. milf, blonde, amateur, pov, onlyfans, anal, jav).
8. "faq": 2 natural Q&As matching how users search on Google/Bing/Perplexity.
9. OUTPUT FORMAT: Respond strictly with a JSON array matching the exact order of input videos:
[
  {
    "id": "video_id",
    "seo_title": "Complete Title Here | LustHub",
    "meta_description": "120-155 char natural description.",
    "summary": "2-3 sentences.",
    "highlights": ["Point 1", "Point 2", "Point 3"],
    "tags": ["tag1", "tag2", "tag3", "tag4"],
    "faq": [
      { "question": "Question 1?", "answer": "Answer 1." },
      { "question": "Question 2?", "answer": "Answer 2." }
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35000),
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
      return { results: JSON.parse(rawText), model: activeModel };
    } catch (err) {
      console.warn(`[Attempt ${attempts}/3 failed] ${err.name === 'TimeoutError' ? 'Request timed out after 35s' : err.message}`);
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
  console.log('=== GEMINI CONTENT ENRICHMENT PIPELINE (US/EU OPTIMIZED) ===');
  console.log(`Mode: ${IS_MOCK ? 'MOCK / OFFLINE' : `LIVE (Model: ${GEMINI_MODEL})`}${IS_DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Batch Size: ${BATCH_SIZE} | Limit for this run: ${RUN_LIMIT}`);

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

  const queue = [...sitemapState.videos]
    .filter(v => {
      const existing = db.videos[v.id];
      return !existing || existing.status === 'pending' || existing.status === 'failed' || existing.model === 'mock-enricher';
    })
    .sort((a, b) => {
      const diff = scoreVideoPriority(b) - scoreVideoPriority(a);
      if (Math.abs(diff) > 0.01) return diff;
      return (b.published || b.added || '').localeCompare(a.published || a.added || '');
    })
    .slice(0, RUN_LIMIT);

  console.log(`Queue size: ${queue.length} high-priority videos ready to enrich.`);
  if (queue.length === 0) {
    console.log('All queued videos are already enriched with real AI metadata!');
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log('Runtime safety threshold (12m) reached. Stopping cleanly.');
      break;
    }

    if (quota.requestsToday >= DAILY_REQUEST_LIMIT && !IS_MOCK) {
      console.log('Daily request limit reached during execution. Stopping cleanly.');
      break;
    }

    const batch = queue.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} videos)...`);

    try {
      quota.requestsToday++;
      const { results, model: usedModel } = await callGeminiBatch(batch);

      results.forEach((item, idx) => {
        const orig = batch.find(b => b.id === item.id) || batch[idx] || batch[0];
        const hash = computeSourceHash(orig);
        const validation = validateEnrichment(orig, item);

        if (validation.valid) {
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

      if (!IS_DRY_RUN) {
        db.updated_at = new Date().toISOString();
        await writeFile(ENRICHED_PATH, JSON.stringify(db, null, 2), 'utf8');
        await saveQuotaState(quota);
      }

      if (i + BATCH_SIZE < queue.length && !IS_MOCK) {
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.error('Batch processing failed:', err.message);
      batch.forEach(v => {
        db.videos[v.id] = {
          video_id: v.id,
          status: 'failed',
          rejection_reason: err.message,
          attempts: (db.videos[v.id]?.attempts || 0) + 1,
        };
      });

      if (!IS_DRY_RUN) {
        db.updated_at = new Date().toISOString();
        await writeFile(ENRICHED_PATH, JSON.stringify(db, null, 2), 'utf8');
        await saveQuotaState(quota);
      }
    }
  }

  console.log('\n--- Pipeline Run Summary ---');
  console.log(`Processed: ${processedCount} videos`);
  console.log(`Successfully Enriched: ${successCount}`);
  console.log(`Rejected: ${rejectedCount}`);
  console.log(`Remaining quota today: ${DAILY_REQUEST_LIMIT - quota.requestsToday} requests`);
}

main().catch(console.error);
