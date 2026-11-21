#!/usr/bin/env node
/**
 * scripts/prune-dead-videos.mjs
 * Verifies liveness of AI-enriched videos directly against Eporner's video/id API
 * so deleted/DMCA'd 404 videos are purged from data/enriched-videos.json and NEVER
 * pollute sitemaps/sitemap_videos_*.xml, feed.xml, or data/enriched-runtime.json.
 *
 * Usage:
 *   node scripts/prune-dead-videos.mjs --all         # Full audit of every enriched video
 *   node scripts/prune-dead-videos.mjs --batch 500   # CI rolling check (oldest checked_at first)
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const USER_AGENT = 'lusthub-liveness-bot/1.0 (+https://www.lusthub.my.id/robots.txt)';

const args = process.argv.slice(2);
const CHECK_ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');
const batchIdx = args.indexOf('--batch');
const BATCH_LIMIT = CHECK_ALL
  ? Number.MAX_SAFE_INTEGER
  : (batchIdx !== -1 ? Math.max(1, parseInt(args[batchIdx + 1], 10) || 500) : 500);
const CONCURRENCY = Math.min(Math.max(parseInt(process.env.PRUNE_CONCURRENCY || '8', 10), 1), 20);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Checks single video liveness against Eporner API.
 * Returns: 'alive' | 'dead' | 'unknown' (transient timeout/network error never falsely deletes!)
 */
async function checkVideoLiveness(videoId) {
  const url = `https://www.eporner.com/api/v2/video/id/?id=${encodeURIComponent(videoId)}&format=json`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(7000),
      });
      if (res.status === 404 || res.status === 410) {
        return { state: 'dead', reason: `HTTP ${res.status}` };
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 2) {
          await sleep(1200 * attempt);
          continue;
        }
        return { state: 'unknown', reason: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { state: 'unknown', reason: `HTTP ${res.status}` };
      }
      const json = await res.json();
      if (json && !Array.isArray(json) && !json.error && json.id) {
        return {
          state: 'alive',
          views: Number.parseInt(String(json.views ?? '0').replace(/\D/g, ''), 10) || 0,
          duration: Number.parseInt(String(json.length_sec ?? '0'), 10) || 0,
          thumb: json.default_thumb?.src || '',
        };
      }
      if ((Array.isArray(json) && json.length === 0) || (json && json.error)) {
        return { state: 'dead', reason: 'Eporner empty/error response' };
      }
      return { state: 'unknown', reason: 'Unexpected JSON shape' };
    } catch (err) {
      if (attempt < 2) {
        await sleep(800 * attempt);
        continue;
      }
      return { state: 'unknown', reason: err.name || err.message };
    }
  }
  return { state: 'unknown', reason: 'Retries exhausted' };
}

async function main() {
  const db = JSON.parse(await readFile(ENRICHED_PATH, 'utf8'));
  const entries = Object.values(db.videos || {}).filter(
    v => v && v.status === 'enriched' && v.model && v.model !== 'mock-enricher' && v.video_id
  );

  // Oldest checked_at first so rolling CI batches check every single video evenly over time
  entries.sort((a, b) => String(a.checked_at || '').localeCompare(String(b.checked_at || '')));
  const targets = entries.slice(0, BATCH_LIMIT);

  console.log(`=== EPORNER LIVENESS PRUNER (${CHECK_ALL ? 'FULL AUDIT' : `ROLLING BATCH ${BATCH_LIMIT}`}) ===`);
  console.log(`Active enriched pool: ${entries.length} | Checking: ${targets.length} | Concurrency: ${CONCURRENCY}`);

  let cursor = 0;
  let aliveCount = 0;
  let deadCount = 0;
  let unknownCount = 0;
  const removedIds = new Set();
  const nowIso = new Date().toISOString();

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= targets.length) break;
      const entry = targets[idx];
      const result = await checkVideoLiveness(entry.video_id);
      if (result.state === 'alive') {
        aliveCount++;
        entry.checked_at = nowIso;
        if (result.thumb && result.thumb.includes('_360') && (!entry.thumbnail || !entry.thumbnail.includes('_360'))) {
          entry.thumbnail = result.thumb;
        }
      } else if (result.state === 'dead') {
        deadCount++;
        removedIds.add(entry.video_id);
        entry.status = 'removed';
        entry.rejection_reason = `Removed upstream (${result.reason})`;
        entry.checked_at = nowIso;
      } else {
        unknownCount++;
      }

      const done = aliveCount + deadCount + unknownCount;
      if (done % 500 === 0 || done === targets.length) {
        console.log(`Progress: ${done}/${targets.length} | alive=${aliveCount} dead=${deadCount} unknown=${unknownCount}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length || 1) }, () => worker());
  await Promise.all(workers);

  if (!DRY_RUN && (deadCount > 0 || aliveCount > 0)) {
    db.updated_at = nowIso;
    await writeFile(ENRICHED_PATH, JSON.stringify(db, null, 2), 'utf8');

    // Also strip confirmed dead IDs from data/sitemap-state.json immediately
    if (removedIds.size > 0) {
      try {
        const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
        if (Array.isArray(state.videos)) {
          const before = state.videos.length;
          state.videos = state.videos.filter(v => !removedIds.has(v.id));
          if (state.videos.length !== before) {
            await writeFile(STATE_PATH, `${JSON.stringify(state)}\n`, 'utf8');
            console.log(`Purged ${before - state.videos.length} confirmed dead videos from data/sitemap-state.json.`);
          }
        }
      } catch (err) {
        console.warn('Could not update sitemap-state.json:', err.message);
      }
    }
  }

  console.log(`Liveness audit complete: checked=${targets.length}, alive=${aliveCount}, dead_removed=${deadCount}, unknown_skipped=${unknownCount}.`);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
