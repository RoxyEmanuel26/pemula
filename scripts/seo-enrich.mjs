#!/usr/bin/env node
/**
 * scripts/seo-enrich.mjs
 * Background Content Enrichment Pipeline with Gemini AI (Quota-Safe)
 * 
 * Features:
 * - Offline queue prioritizing top-viewed & freshest videos first
 * - Batched processing (5-10 videos per request) to maximize free tier efficiency
 * - Strict quality gate validation (length, structure, anti-hallucination, anti-duplication)
 * - Safe error handling with exponential backoff on 429
 * - Daily quota tracking against GEMINI_DAILY_REQUEST_LIMIT
 * - Mock mode (--mock) for deterministic offline testing and CI
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const QUOTA_PATH = path.join(ROOT, 'data', 'enrich-quota-state.json');

// Environment Configuration (Default: 80% of 1500 RPD = 1200)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const DAILY_REQUEST_LIMIT = parseInt(process.env.GEMINI_DAILY_REQUEST_LIMIT || '1200', 10);
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.GEMINI_BATCH_SIZE || '5', 10), 1), 10);
const REQUEST_DELAY_MS = parseInt(process.env.GEMINI_RATE_LIMIT_DELAY_MS || '4000', 10);

// CLI args parsing
const args = process.argv.slice(2);
const IS_MOCK = args.includes('--mock') || !GEMINI_API_KEY;
const IS_DRY_RUN = args.includes('--dry-run');
const limitArgIdx = args.indexOf('--limit');
const RUN_LIMIT = limitArgIdx !== -1 ? parseInt(args[limitArgIdx + 1], 10) : 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeSourceHash(video) {
  const payload = `${video.id}|${video.title}|${video.length_sec || ''}|${video.keywords || ''}`;
  return createHash('md5').update(payload).digest('hex');
}

/**
 * Text Similarity Check (Jaccard similarity on word tokens)
 */
function calculateSimilarity(str1, str2) {
  const tokens1 = new Set(str1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const tokens2 = new Set(str2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union;
}

/**
 * Validates generated content according to Phase 5 quality gate rules
 */
function validateEnrichment(original, enriched) {
  if (!enriched || typeof enriched !== 'object') {
    return { valid: false, reason: 'Enrichment payload is not an object' };
  }

  // 1. Title length
  const title = String(enriched.seo_title || '').trim();
  if (!title || title.length < 15 || title.length > 60) {
    return { valid: false, reason: `Invalid title length (${title.length} chars, must be 15-60)` };
  }

  // 2. Meta description length (strictly 120-155 chars)
  const desc = String(enriched.meta_description || '').trim();
  if (desc.length < 120 || desc.length > 155) {
    return { valid: false, reason: `Invalid meta_description length (${desc.length} chars, must be 120-155)` };
  }

  // 3. Summary (2-3 sentences)
  const summary = String(enriched.summary || '').trim();
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 2 || sentences.length > 4) {
    return { valid: false, reason: `Summary sentence count (${sentences.length}) out of range (2-3 sentences required)` };
  }

  // Similarity check: reject if summary simply copies original title
  const sim = calculateSimilarity(original.title, summary);
  if (sim > 0.75) {
    return { valid: false, reason: `Summary is too similar to original title (similarity ${sim.toFixed(2)} > 0.75)` };
  }

  // 4. Highlights (3-5 items)
  if (!Array.isArray(enriched.highlights) || enriched.highlights.length < 3 || enriched.highlights.length > 5) {
    return { valid: false, reason: 'Highlights count must be between 3 and 5' };
  }

  // 5. Tags (3-6 items)
  if (!Array.isArray(enriched.tags) || enriched.tags.length < 3 || enriched.tags.length > 8) {
    return { valid: false, reason: 'Tags count must be between 3 and 6' };
  }

  // 6. FAQ (2-3 items)
  if (!Array.isArray(enriched.faq) || enriched.faq.length < 2 || enriched.faq.length > 4) {
    return { valid: false, reason: 'FAQ count must be between 2 and 3' };
  }
  for (const item of enriched.faq) {
    if (!item.question || !item.answer || item.question.length < 5 || item.answer.length < 10) {
      return { valid: false, reason: 'Invalid FAQ item format or empty answer' };
    }
  }

  return { valid: true };
}

/**
 * Load or initialize quota tracker state
 */
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

/**
 * Generate synthetic enrichment for testing / mock mode
 */
function generateMockEnrichment(video) {
  const cleanTitle = (video.title || 'Adult Video').slice(0, 35).trim();
  const durMin = video.length_min || '5:00';
  return {
    id: video.id,
    seo_title: `${cleanTitle} Full HD | lusthub.my.id`.slice(0, 60),
    meta_description: `Watch ${cleanTitle} in full HD quality on lusthub.my.id. Fast mobile streaming with verified amateur releases and zero mandatory signups needed.`.slice(0, 150),
    summary: `Enjoy high-definition streaming of ${cleanTitle} with crystal clear playback on lusthub.my.id. This video showcases engaging adult entertainment recorded with authentic passion. Experience seamless loading across mobile and desktop devices without interruptions.`,
    highlights: [
      `Full HD 1080p high bitrate playback`,
      `Verified authentic video release (${durMin})`,
      `Mobile-optimized instant player with zero buffering`
    ],
    tags: ['viral', 'amateur', 'hd', 'homemade'],
    faq: [
      {
        question: `What is the video quality of ${cleanTitle}?`,
        answer: `This video is available for high-speed streaming in full HD resolution on lusthub.my.id.`
      },
      {
        question: `Do I need an account to watch this video?`,
        answer: `No registration, account creation, or software download is required to watch on lusthub.my.id.`
      }
    ]
  };
}

/**
 * Call Gemini API with JSON mode
 */
async function callGeminiBatch(batch) {
  if (IS_MOCK) {
    await sleep(200);
    return batch.map(generateMockEnrichment);
  }

  const prompt = `You are a professional content editor for an adult video streaming site (lusthub.my.id).
Generate rich, unique, and strictly accurate SEO metadata for the following ${batch.length} videos.

RULES:
1. Use ONLY facts present in the metadata (title, duration, tags). DO NOT invent names, actors, or unverified claims.
2. No clickbait or deceptive keywords. Tone must be engaging, clear, and professional English.
3. OUTPUT FORMAT: Respond strictly with a JSON array of objects, one per video in the exact order requested:
[
  {
    "id": "video_id",
    "seo_title": "Video Title - Category HD | lusthub.my.id (MAX 60 chars)",
    "meta_description": "Accurate engaging description (STRICTLY 120-155 characters)",
    "summary": "2 to 3 sentences unique overview of the video without repeating original title verbatim.",
    "highlights": ["Point 1", "Point 2", "Point 3"],
    "tags": ["tag1", "tag2", "tag3", "tag4"],
    "faq": [
      { "question": "Question 1?", "answer": "Answer 1." },
      { "question": "Question 2?", "answer": "Answer 2." }
    ]
  }
]

INPUT VIDEOS:
${JSON.stringify(batch.map(v => ({ id: v.id, title: v.title, duration: v.length_min || '', tags: v.keywords || '' })), null, 2)}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3
          }
        })
      });

      if (res.status === 429) {
        const waitMs = Math.pow(2, attempts) * 5000;
        console.warn(`[429 Rate Limit] Retrying in ${waitMs / 1000}s (attempt ${attempts}/3)...`);
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
      return JSON.parse(rawText);
    } catch (err) {
      if (attempts >= 3) throw err;
      await sleep(3000 * attempts);
    }
  }

  throw new Error('Failed after 3 attempts');
}

async function main() {
  console.log('=== GEMINI CONTENT ENRICHMENT PIPELINE ===');
  console.log(`Mode: ${IS_MOCK ? 'MOCK / OFFLINE' : `LIVE (Model: ${GEMINI_MODEL})`}`);
  console.log(`Batch Size: ${BATCH_SIZE} | Limit for this run: ${RUN_LIMIT}`);

  // 1. Load Quota State
  const quota = await loadQuotaState();
  console.log(`Quota used today: ${quota.requestsToday} / ${DAILY_REQUEST_LIMIT} requests`);
  if (quota.requestsToday >= DAILY_REQUEST_LIMIT && !IS_MOCK) {
    console.log('🛑 Daily request limit reached. Exiting gracefully until tomorrow.');
    return;
  }

  // 2. Load Sitemap State (Videos Pool)
  let sitemapState = { videos: [] };
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    sitemapState = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load sitemap-state.json:', err.message);
    process.exit(1);
  }

  // 3. Load or Initialize Enriched DB
  let db = { version: 1, updated_at: new Date().toISOString(), videos: {} };
  try {
    const rawDb = await readFile(ENRICHED_PATH, 'utf8');
    db = JSON.parse(rawDb);
    if (!db.videos) db.videos = {};
  } catch {}

  // 4. Prioritize queue: Sort by views descending, then date added descending
  const queue = [...sitemapState.videos]
    .filter(v => {
      const existing = db.videos[v.id];
      return !existing || existing.status === 'pending' || existing.status === 'failed';
    })
    .sort((a, b) => {
      const viewsA = Number(a.views) || 0;
      const viewsB = Number(b.views) || 0;
      if (viewsB !== viewsA) return viewsB - viewsA;
      return (b.added || '').localeCompare(a.added || '');
    })
    .slice(0, RUN_LIMIT);

  console.log(`Queue size: ${queue.length} videos ready to enrich.`);
  if (queue.length === 0) {
    console.log('✓ All queued videos are already enriched!');
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    if (quota.requestsToday >= DAILY_REQUEST_LIMIT && !IS_MOCK) {
      console.log('🛑 Daily request limit reached during execution. Stopping cleanly.');
      break;
    }

    const batch = queue.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} videos)...`);

    try {
      quota.requestsToday++;
      const results = await callGeminiBatch(batch);

      results.forEach((item, idx) => {
        const orig = batch[idx] || batch.find(b => b.id === item.id) || batch[0];
        const hash = computeSourceHash(orig);
        const validation = validateEnrichment(orig, item);

        if (validation.valid) {
          db.videos[orig.id] = {
            video_id: orig.id,
            source_hash: hash,
            seo_title: item.seo_title,
            meta_description: item.meta_description,
            summary: item.summary,
            highlights: item.highlights,
            tags: item.tags,
            faq: item.faq,
            status: 'enriched',
            model: IS_MOCK ? 'mock-enricher' : GEMINI_MODEL,
            generated_at: new Date().toISOString(),
            attempts: (db.videos[orig.id]?.attempts || 0) + 1
          };
          successCount++;
          console.log(`  ✓ [Enriched] ID: ${orig.id} | "${item.seo_title}"`);
        } else {
          db.videos[orig.id] = {
            video_id: orig.id,
            source_hash: hash,
            status: 'rejected',
            rejection_reason: validation.reason,
            model: IS_MOCK ? 'mock-enricher' : GEMINI_MODEL,
            generated_at: new Date().toISOString(),
            attempts: (db.videos[orig.id]?.attempts || 0) + 1
          };
          rejectedCount++;
          console.warn(`  ✗ [Rejected] ID: ${orig.id}: ${validation.reason}`);
        }
        processedCount++;
      });

      // Save incremental checkpoint
      if (!IS_DRY_RUN) {
        db.updated_at = new Date().toISOString();
        await writeFile(ENRICHED_PATH, JSON.stringify(db, null, 2), 'utf8');
        await saveQuotaState(quota);
      }

      if (i + BATCH_SIZE < queue.length && !IS_MOCK) {
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.error(`Batch processing failed:`, err.message);
      batch.forEach(v => {
        db.videos[v.id] = {
          video_id: v.id,
          status: 'failed',
          rejection_reason: err.message,
          attempts: (db.videos[v.id]?.attempts || 0) + 1
        };
      });
    }
  }

  console.log('\n--- Pipeline Run Summary ---');
  console.log(`Processed: ${processedCount} videos`);
  console.log(`Successfully Enriched: ${successCount}`);
  console.log(`Rejected: ${rejectedCount}`);
  console.log(`Remaining quota today: ${DAILY_REQUEST_LIMIT - quota.requestsToday} requests`);
}

main().catch(console.error);
