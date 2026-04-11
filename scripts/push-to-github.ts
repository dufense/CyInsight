import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Target repo ────────────────────────────────────────────────────────────
// The GITHUB_PAT secret belongs to the 'dufense' GitHub account (confirmed by
// GET /user returning login: dufense). 'uttamkhot007/CyInsight' returns HTTP 404
// with this token — the dufense account is not a collaborator there.
//
// 'dufense/CyInsight' is the verified accessible target for this PAT.
// Override via env: GITHUB_OWNER=<owner> GITHUB_REPO=<repo>
const TARGET_OWNER = process.env.GITHUB_OWNER ?? 'dufense';
const TARGET_REPO  = process.env.GITHUB_REPO  ?? 'CyInsight';
const PROJECT_DIR  = '/home/runner/workspace';

// ─── Source allowlist ───────────────────────────────────────────────────────
// Only directories explicitly listed here are walked. This avoids accidentally
// uploading workspace internals, data/, uploads/, or any other non-source paths.
const SOURCE_DIRS: string[] = [
  'client', 'server', 'shared', 'migrations',
  'scripts', 'tests', 'services',
  'deploy', 'helm', 'docs', 'references',
];
const ROOT_FILES: string[] = [
  'package.json', 'tsconfig.json', 'vite.config.ts', 'drizzle.config.ts',
  'tailwind.config.ts', 'postcss.config.js', '.env.example', '.gitignore',
  'Dockerfile', 'docker-compose.yml', 'ARCHITECTURE.md', 'DEPLOYMENT.md',
  'replit.md', 'start-prod.js',
];

// ─── Exclusion policy ───────────────────────────────────────────────────────
// Excludes generated artifacts, tooling internals, and known large reference
// data that would exhaust GitHub secondary rate limits.
// sigma-rules/ contains 3,130 SigmaHQ YAML rules (~180 MB) — reference data,
// not authored source code; excluded to stay within API rate limits.
const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', '.git', '.cache', '.config', '.local', '.upm',
  'tmp', '.npm', '.nix-profile', '.pnpm-store', '__pycache__', '.pythonlibs',
  'venv', '.venv', 'coverage', '.nyc_output', 'sigma-rules',
  'server/public',
]);
const EXCLUDE_NAMES = new Set([
  '.DS_Store', 'replit.nix', '.breakpoints', 'repl_state.bin',
  'tsconfig.tsbuildinfo', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
]);
// Sensitive file patterns — never upload regardless of directory
const SENSITIVE_PATTERNS = [
  /^\.env$/, /^\.env\./, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/,
  /cookies\.txt$/i, /secrets\.json$/i, /credentials\.json$/i,
];
const EXCLUDE_EXTENSIONS = new Set(['.tar.gz', '.log']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // GitHub blob API hard limit

function isSensitive(name: string): boolean {
  return SENSITIVE_PATTERNS.some(r => r.test(name));
}

function shouldExclude(relPath: string): boolean {
  const parts = relPath.split('/');
  for (const p of parts) if (EXCLUDE_DIRS.has(p)) return true;
  const name = parts[parts.length - 1];
  if (EXCLUDE_NAMES.has(name) || isSensitive(name)) return true;
  for (const ext of EXCLUDE_EXTENSIONS) if (relPath.endsWith(ext)) return true;
  return false;
}

function walk(absDir: string, relBase: string): string[] {
  const files: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (shouldExclude(rel)) continue;
    if (e.isDirectory()) files.push(...walk(path.join(absDir, e.name), rel));
    else if (e.isFile()) {
      let size = 0;
      try { size = fs.statSync(path.join(absDir, e.name)).size; } catch { continue; }
      if (size < MAX_FILE_BYTES) files.push(rel);
    }
  }
  return files;
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const abs = path.join(PROJECT_DIR, dir);
    if (fs.existsSync(abs)) files.push(...walk(abs, dir));
  }
  for (const f of ROOT_FILES) {
    const abs = path.join(PROJECT_DIR, f);
    if (!isSensitive(f) && fs.existsSync(abs)) {
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { continue; }
      if (size < MAX_FILE_BYTES) files.push(f);
    }
  }
  return files;
}

// ─── Octokit error typing ────────────────────────────────────────────────────
interface OctokitError { status?: number; message?: string }
function isOctokitError(e: unknown): e is OctokitError {
  return typeof e === 'object' && e !== null && ('status' in e || 'message' in e);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function uploadBlob(
  octokit: Octokit, owner: string, repo: string, relPath: string,
): Promise<{ path: string; mode: '100644'; type: 'blob'; sha: string } | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = fs.readFileSync(path.join(PROJECT_DIR, relPath));
      const isBinary = buf.includes(0) ||
        /\.(png|jpg|jpeg|gif|ico|webp|woff|woff2|ttf|eot|pdf|zip|bin)$/i.test(relPath);
      const blob = await octokit.git.createBlob({
        owner, repo,
        content:  isBinary ? buf.toString('base64') : buf.toString('utf-8'),
        encoding: isBinary ? 'base64' : 'utf-8',
      });
      return { path: relPath, mode: '100644', type: 'blob', sha: blob.data.sha };
    } catch (e: unknown) {
      const err = isOctokitError(e) ? e : {};
      if (attempt === 3) { console.log(`  FAIL: ${relPath} (HTTP ${err.status ?? 'unknown'})`); return null; }
      await sleep(err.status === 403 || err.status === 429 ? 2000 : 500);
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const token = process.env.GITHUB_PAT;
  if (!token) throw new Error('GITHUB_PAT environment variable is not set');

  const octokit = new Octokit({ auth: token });
  const owner = TARGET_OWNER, repo = TARGET_REPO;

  console.log(`Target: ${owner}/${repo}`);
  try {
    const r = await octokit.repos.get({ owner, repo });
    console.log(`Repo: ${r.data.full_name} (${r.data.private ? 'private' : 'public'})`);
  } catch (e: unknown) {
    const err = isOctokitError(e) ? e : {};
    console.error(
      `ERROR: Cannot access ${owner}/${repo} (HTTP ${err.status ?? 'unknown'}).\n` +
      `The GITHUB_PAT may belong to a different account. To fix:\n` +
      `  1. Add the PAT owner as a collaborator on ${owner}/${repo}, OR\n` +
      `  2. Set env vars: GITHUB_OWNER=<your-org> GITHUB_REPO=<your-repo>\n`,
    );
    process.exit(1);
  }

  // Resolve base commit and TREE SHA.
  // GitHub createTree requires a tree SHA for base_tree — not a commit SHA.
  let baseCommitSha: string | undefined;
  let baseTreeSha: string | undefined;
  try {
    const ref = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
    baseCommitSha = ref.data.object.sha;
    const commitObj = await octokit.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
    baseTreeSha = commitObj.data.tree.sha;
    console.log(`Base commit: ${baseCommitSha.slice(0, 8)}  tree: ${baseTreeSha.slice(0, 8)}`);
  } catch {
    console.log('No main branch yet — creating initial commit.');
  }

  const files = collectFiles();
  console.log(`\nFiles to upload: ${files.length}  (batches of 3, 300 ms gap)`);

  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  let ok = 0, failed = 0;
  const BATCH = 3;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(f => uploadBlob(octokit, owner, repo, f)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) { treeItems.push(r.value); ok++; }
      else failed++;
    }
    const done = Math.min(i + BATCH, files.length);
    if (Math.floor(done / 50) > Math.floor(i / 50) || done === files.length)
      console.log(`  [${done}/${files.length}] ${ok} OK, ${failed} failed`);
    await sleep(300);
  }

  console.log(`\nUpload summary: ${ok} OK, ${failed} failed of ${files.length}`);

  // Partial upload is treated as failure — do not commit an incomplete tree.
  if (failed > 0) {
    console.error(
      `\nERROR: ${failed} file(s) failed to upload. Aborting — no commit created.\n` +
      `Re-run this script; rate-limited blobs are often recoverable on retry.\n`,
    );
    process.exit(1);
  }
  if (!treeItems.length) { console.error('Nothing uploaded — aborting.'); process.exit(1); }

  console.log('Creating git tree...');
  const tree = await octokit.git.createTree({
    owner, repo, tree: treeItems,
    ...(baseTreeSha ? { base_tree: baseTreeSha } : {}), // must be a tree SHA
  });

  console.log('Creating commit...');
  const commit = await octokit.git.createCommit({
    owner, repo,
    message: [
      'Cyber Command Center — Tasks #72–#86 complete sync',
      '',
      'Key deliverables:',
      '- Executive AI Intelligence Briefing & SOC KPI Dashboard',
      '- CISO Security Briefing: MITRE ATT&CK heatmap, Kill Chain phases',
      '- Attack-Vector Radar and Gauge component redesigns',
      '- Enterprise Data Infrastructure: DB Connector Registry (server/db-connector-registry.ts),',
      '  DuckDB parquet integration (server/data-lake.ts), migration 0018_add_db_connectors.sql',
      '- Data Infrastructure admin tab with connector CRUD, SLA/MSA tracking',
      '- Platform Health connector view with inactivity alerts',
      '- SSRF controls (validateSaaSDomain) for Snowflake/Databricks probes',
      '- Federated Cross-Tenant Threat Intelligence engine',
      '- CAASM module: Asset Intelligence, Device Posture, Attack Surface',
      '- PWA: service worker, offline fallback, mobile bottom nav, install banner',
      '',
      'Excluded: sigma-rules/ (3,130 SigmaHQ YAML rules, reference data ~180 MB)',
    ].join('\n'),
    tree: tree.data.sha,
    parents: baseCommitSha ? [baseCommitSha] : [],
  });
  console.log(`Commit: ${commit.data.sha}`);

  try {
    await octokit.git.updateRef({ owner, repo, ref: 'heads/main', sha: commit.data.sha, force: true });
    console.log('Branch main updated.');
  } catch {
    await octokit.git.createRef({ owner, repo, ref: 'refs/heads/main', sha: commit.data.sha });
    console.log('Branch main created.');
  }
  console.log(`\n✓  https://github.com/${owner}/${repo}`);

  // Verify all task-required key files are present on remote.
  console.log('\nVerifying required key files:');
  const REQUIRED = [
    'client/src/pages/admin-portal.tsx',
    'client/src/components/attack-vector-radar.tsx',
    'server/routes.ts',
    'server/db-connector-registry.ts',
    'server/data-lake.ts',
    'shared/schema.ts',
    'migrations/0018_add_db_connectors.sql',
  ];
  let allPresent = true;
  for (const f of REQUIRED) {
    try { await octokit.repos.getContent({ owner, repo, path: f }); console.log(` ✓  ${f}`); }
    catch { console.log(` ✗  MISSING: ${f}`); allPresent = false; }
  }
  if (!allPresent) { console.error('\nERROR: one or more required files are missing.'); process.exit(1); }
  console.log('\nDone!');
}

main().catch((e: unknown) => {
  const msg = isOctokitError(e) ? (e.message ?? String(e)) : String(e);
  console.error('Fatal:', msg);
  process.exit(1);
});
