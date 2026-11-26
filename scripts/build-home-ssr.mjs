#!/usr/bin/env node
/**
 * scripts/build-home-ssr.mjs
 * Statically pre-renders the V2.0 Cinema Obsidian English homepage (index.html)
 * directly from data/runtime/index.json and lib/home-renderer.js so `/` serves
 * instantaneously from static edge storage (< 30ms) with 100% parity to /de, /fr, /es, /it.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getRuntimeIndex } from '../lib/runtime-store.js';
import { renderHomePage } from '../lib/home-renderer.js';

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'index.html');

async function main() {
  const index = await getRuntimeIndex();
  const html = renderHomePage({ lang: 'en', localeCfg: null, index, hasNoindexParam: false });

  let previous = '';
  try { previous = await readFile(INDEX_PATH, 'utf8'); } catch {}

  if (html !== previous) {
    await writeFile(INDEX_PATH, html, 'utf8');
    console.log(
      `Rebuilt V2.0 static index.html: ${index.n} alive videos indexed, ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB total.`
    );
  } else {
    console.log('V2.0 index.html unchanged.');
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
