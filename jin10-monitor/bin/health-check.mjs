#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const STATE_FILE = join(root, 'state.json');
const LOCK_FILE = join(root, '.lock');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const state = existsSync(STATE_FILE) ? readJson(STATE_FILE) : null;

let lockPid = null;
if (existsSync(LOCK_FILE)) {
  const raw = String(readFileSync(LOCK_FILE, 'utf-8')).trim();
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n)) lockPid = n;
}

const out = {
  ok: true,
  now: Date.now(),
  monitor: {
    lockFile: existsSync(LOCK_FILE),
    pid: lockPid,
    alive: pidAlive(lockPid),
  },
  state: state || null,
};

// Basic health signals
if (!out.monitor.alive) out.ok = false;

process.stdout.write(JSON.stringify(out, null, 2));
