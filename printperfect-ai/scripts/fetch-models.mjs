#!/usr/bin/env node
/**
 * Build-time model fetcher.
 *
 * Runs as a `prebuild` hook (see package.json). Downloads any model assets
 * whose URL is configured via env vars into `public/models/`, so the .onnx
 * files are bundled into the deployed app without us having to commit them
 * to git.
 *
 * Idempotent: if a file already exists at the destination path it's skipped,
 * so `next dev` rebuilds and incremental CI caches don't re-download.
 *
 * Configure with env vars (set in `.env.local` for dev, or your deploy
 * provider's env settings for prod):
 *
 *   MODEL_COLORIZE_URL    — e.g. a GitHub Releases asset URL serving eccv16.onnx
 *   MODEL_INPAINT_URL     — optional override for the LaMa inpainting model
 *   ...etc, one per `<TOOL>` in MODEL_FILES below.
 *
 * Each entry has a default URL too — leave the env var unset to use it.
 *
 * Usage:
 *   node scripts/fetch-models.mjs            # download missing models
 *   node scripts/fetch-models.mjs --force    # re-download even if present
 */

import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public', 'models');

/**
 * One entry per model file. The build will only attempt to fetch a model if
 * either its env var is set OR its `defaultUrl` is non-empty. Set
 * `required: true` to fail the build if the URL is missing.
 */
const MODEL_FILES = [
  {
    name: 'eccv16.onnx',
    envVar: 'MODEL_COLORIZE_URL',
    defaultUrl: '', // user-supplied; e.g. a GitHub Releases asset on their fork
    sizeMb: 129,
    required: false, // colorizer falls back to sepia if not present
  },
  // Add more here as we host other models, e.g.:
  // { name: 'lama.onnx', envVar: 'MODEL_INPAINT_URL', defaultUrl: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx', sizeMb: 196, required: false },
];

const FORCE = process.argv.includes('--force');

function fmtMB(bytes) {
  return (bytes / 1e6).toFixed(1) + ' MB';
}

function shouldSkip(destPath) {
  if (FORCE) return false;
  if (!existsSync(destPath)) return false;
  // Existing zero-byte file is treated as a failed previous attempt.
  return statSync(destPath).size > 0;
}

async function downloadOne({ name, envVar, defaultUrl, sizeMb, required }) {
  const url = process.env[envVar] || defaultUrl;
  const dest = resolve(OUT_DIR, name);

  if (!url) {
    if (required) {
      console.error(`[fetch-models] ✗ ${name}: ${envVar} is not set and no default URL`);
      process.exitCode = 1;
    } else {
      console.log(
        `[fetch-models] · ${name}: skipped (set ${envVar} to enable; ` +
          `the matching feature will fall back to its degraded mode at runtime)`,
      );
    }
    return;
  }

  if (shouldSkip(dest)) {
    const have = statSync(dest).size;
    console.log(`[fetch-models] = ${name}: already present (${fmtMB(have)}), skipping`);
    return;
  }

  console.log(`[fetch-models] ↓ ${name}: ${url} (~${sizeMb} MB)`);
  mkdirSync(OUT_DIR, { recursive: true });

  // Follow up to 10 redirects (GitHub Releases redirects to S3, etc.).
  let currentUrl = url;
  let res;
  for (let hop = 0; hop < 10; hop++) {
    res = await fetch(currentUrl, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      currentUrl = new URL(res.headers.get('location'), currentUrl).toString();
      continue;
    }
    break;
  }

  if (!res || !res.ok || !res.body) {
    console.error(
      `[fetch-models] ✗ ${name}: HTTP ${res?.status ?? '???'} from ${currentUrl}`,
    );
    process.exitCode = 1;
    return;
  }

  const total = Number(res.headers.get('content-length') || 0);
  const tmp = dest + '.part';
  if (existsSync(tmp)) unlinkSync(tmp);

  let received = 0;
  let lastLog = 0;
  const reporter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.length;
      const now = Date.now();
      if (total && now - lastLog > 500) {
        const pct = ((received / total) * 100).toFixed(1);
        process.stdout.write(`\r    ${fmtMB(received)} / ${fmtMB(total)} (${pct}%)`);
        lastLog = now;
      }
      controller.enqueue(chunk);
    },
  });

  try {
    await pipeline(res.body.pipeThrough(reporter), createWriteStream(tmp));
    process.stdout.write('\r    ' + fmtMB(received) + ' done           \n');
  } catch (err) {
    console.error(`\n[fetch-models] ✗ ${name}: download failed —`, err.message);
    if (existsSync(tmp)) unlinkSync(tmp);
    process.exitCode = 1;
    return;
  }

  // Atomic-ish: rename only after a successful write.
  if (existsSync(dest)) unlinkSync(dest);
  await import('node:fs/promises').then((fs) => fs.rename(tmp, dest));
  console.log(`[fetch-models] ✓ ${name}: saved to public/models/${name}`);
}

async function main() {
  console.log('[fetch-models] checking ' + MODEL_FILES.length + ' model file(s)...');
  for (const entry of MODEL_FILES) {
    try {
      await downloadOne(entry);
    } catch (err) {
      console.error(`[fetch-models] ✗ ${entry.name}: unexpected error —`, err);
      process.exitCode = 1;
    }
  }
  if (process.exitCode) {
    console.error('[fetch-models] one or more required downloads failed');
  } else {
    console.log('[fetch-models] all done');
  }
}

main();
