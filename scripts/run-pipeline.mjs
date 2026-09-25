#!/usr/bin/env node
// Regenerates everything in public/data/ from scratch with one command:
//   npm run data                 downloads (skips files already in data/raw/) + processing
//   npm run data -- --force      re-downloads everything
//   npm run data -- --no-lidar   skips the ~2 GB of LiDAR (heights then come from the Cadastre)
//   npm run data:process         processing only (data/raw/ must exist)
// Creates a Python virtual environment in .venv/ with requirements.txt on first run.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const has = (a) => args.includes(a);
const win = process.platform === 'win32';
const py = join(root, '.venv', win ? 'Scripts/python.exe' : 'bin/python');

function run(cmd, cargs) {
  console.log(`\n> ${[cmd, ...cargs].join(' ')}`);
  const r = spawnSync(cmd, cargs, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${cargs.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(py)) {
  const base = ['python3', 'python', 'py'].find((c) => {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
  });
  if (!base) { console.error('Python 3.11+ is required'); process.exit(1); }
  run(base, ['-m', 'venv', '.venv']);
  run(py, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(py, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
}

const force = has('--force') ? ['--force'] : [];
if (!has('--process-only')) {
  run(py, ['scripts/download_osm.py', ...force]);
  run(py, ['scripts/download_cadastre.py', ...force]);
  run(py, ['scripts/download_icgc.py', ...force, ...(has('--no-lidar') ? ['--no-lidar'] : [])]);
  run(py, ['scripts/download_opendata.py', ...force]);
}
if (!has('--no-lidar')) run(py, ['scripts/process_lidar.py']);
run(py, ['scripts/process.py']);
console.log('\nDone: public/data/ regenerated.');
