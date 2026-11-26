/**
 * lib/runtime-store.js
 * Sharded O(1) runtime reader for LustHub V2.0.
 * - Reads bounded data/runtime/index.json for homepage, category, and discovery hubs
 * - Reads ONLY the exact 1/64 hash shard (~115 KB, <2ms parse) for individual /v/:slug pages
 * - Automatically falls back to legacy data/enriched-runtime.json if shards are absent
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expandRuntimeVideo } from './schema.js';

export const SHARD_COUNT = 64;

let cachedIndex = null;
let cachedOrderedPos = null;
let cachedLegacy = null;
const SHARD_CACHE = new Map();
const MAX_CACHED_SHARDS = 32;

export function getShardKey(videoId) {
  const hash = createHash('md5').update(String(videoId || '')).digest();
  const bucket = hash[0] % SHARD_COUNT;
  return bucket.toString(16).padStart(2, '0');
}

export async function getRuntimeIndex() {
  if (cachedIndex) return cachedIndex;
  try {
    const raw = await readFile(path.join(process.cwd(), 'data', 'runtime', 'index.json'), 'utf8');
    cachedIndex = JSON.parse(raw);
    if (Array.isArray(cachedIndex.orderedIds)) {
      cachedOrderedPos = new Map(cachedIndex.orderedIds.map((id, idx) => [id, idx]));
    }
    return cachedIndex;
  } catch {
    // Graceful fallback to legacy monolithic runtime file
    if (!cachedLegacy) {
      try {
        const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-runtime.json'), 'utf8');
        cachedLegacy = JSON.parse(raw);
      } catch {
        cachedLegacy = { v: 0, n: 0, orderedIds: [], featured: [], byTag: {}, cards: {}, videos: {} };
      }
    }
    const cards = {};
    for (const [id, v] of Object.entries(cachedLegacy.videos || {})) {
      cards[id] = { id, t: v.t, s: v.s, th: v.th, du: v.du || 0, vw: v.vw || 0, at: v.at || '', tg: (v.tg || []).slice(0, 4) };
    }
    cachedIndex = {
      v: cachedLegacy.v || 0,
      n: cachedLegacy.n || Object.keys(cards).length,
      orderedIds: cachedLegacy.orderedIds || Object.keys(cards),
      featured: cachedLegacy.featured || [],
      topViewed: cachedLegacy.featured || [],
      longest: [],
      javIds: [],
      byTag: cachedLegacy.byTag || {},
      cards,
      _legacy: true,
    };
    cachedOrderedPos = new Map(cachedIndex.orderedIds.map((id, idx) => [id, idx]));
    return cachedIndex;
  }
}

export function getOrderedPosition(videoId) {
  return cachedOrderedPos?.has(videoId) ? cachedOrderedPos.get(videoId) : -1;
}

async function readShard(shardKey) {
  if (SHARD_CACHE.has(shardKey)) {
    const val = SHARD_CACHE.get(shardKey);
    // LRU touch
    SHARD_CACHE.delete(shardKey);
    SHARD_CACHE.set(shardKey, val);
    return val;
  }
  try {
    const raw = await readFile(path.join(process.cwd(), 'data', 'runtime', 'shards', `${shardKey}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    if (SHARD_CACHE.size >= MAX_CACHED_SHARDS) {
      const oldestKey = SHARD_CACHE.keys().next().value;
      SHARD_CACHE.delete(oldestKey);
    }
    SHARD_CACHE.set(shardKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetches full expanded AI-enriched metadata for a single video ID in O(1) (~115 KB shard parse).
 */
export async function getEnrichedVideoById(videoId) {
  if (!videoId) return null;
  const shard = await readShard(getShardKey(videoId));
  if (shard && shard[videoId]) {
    return expandRuntimeVideo(shard[videoId]);
  }
  if (cachedLegacy?.videos?.[videoId]) {
    return expandRuntimeVideo(cachedLegacy.videos[videoId]);
  }
  return null;
}

/**
 * Fetches compact card objects for a list of video IDs, hitting in-memory index.cards first
 * and reading only missing shards in parallel.
 */
export async function getCardsByIds(ids = []) {
  const index = await getRuntimeIndex();
  const cardsMap = index.cards || {};
  const missingByShard = new Map();

  for (const id of ids) {
    if (!id || cardsMap[id]) continue;
    const sk = getShardKey(id);
    if (!missingByShard.has(sk)) missingByShard.set(sk, []);
    missingByShard.get(sk).push(id);
  }

  const shardData = new Map();
  if (missingByShard.size > 0) {
    await Promise.all(
      [...missingByShard.keys()].map(async (sk) => {
        const s = await readShard(sk);
        if (s) shardData.set(sk, s);
      })
    );
  }

  const out = [];
  for (const id of ids) {
    if (!id) continue;
    const c = cardsMap[id];
    if (c) {
      out.push({
        id,
        title: c.t || '',
        slug: c.s || id,
        thumbnail: c.th || '',
        duration: Number(c.du || 0),
        views: Number(c.vw || 0),
        date: c.at || '',
        tags: Array.isArray(c.tg) ? c.tg : [],
        isEnriched: true,
      });
      continue;
    }
    const raw = shardData.get(getShardKey(id))?.[id];
    if (raw) {
      out.push({
        id: raw.id || id,
        title: raw.t || '',
        slug: raw.s || id,
        thumbnail: raw.th || '',
        duration: Number(raw.du || 0),
        views: Number(raw.vw || 0),
        date: raw.at || '',
        tags: Array.isArray(raw.tg) ? raw.tg.slice(0, 4) : [],
        isEnriched: true,
      });
    }
  }
  return out;
}

/**
 * Fast O(1) membership check whether a video ID is in the alive indexable AI catalog.
 */
export async function isEnrichedVideoId(videoId) {
  if (!videoId) return false;
  const index = await getRuntimeIndex();
  if (index.cards?.[videoId]) return true;
  if (cachedOrderedPos?.has(videoId)) return true;
  return false;
}
