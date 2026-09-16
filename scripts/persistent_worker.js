/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const WINDOW_MS = (parseInt(process.env.WINDOW_MINUTES || '350') - 5) * 60 * 1000;
const startTime = Date.now();

const EXPORT_CMD = {
  glb: (f) => `
out_path = '${f}'
exported = False

# Enable glTF addon (may be disabled by default in Blender 5.x)
try:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    print("[BL] glTF addon enabled")
except Exception as ex:
    print(f"[BL] addon enable: {ex}")

# List available export operators for debugging
ops = [str(o) for o in dir(bpy.ops) if 'export' in o.lower() or 'gltf' in o.lower()]
if ops:
    print(f"[BL] export ops: {ops}")

# Method 1: standard
try:
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB')
    if os.path.exists(out_path) and os.path.getsize(out_path) > 50:
        exported = True
        print(f"[BL] export method 1 OK")
except Exception as e1:
    print(f"[BL] method 1: {e1}")

# Method 2: no format param
if not exported:
    try:
        bpy.ops.export_scene.gltf(filepath=out_path)
        if os.path.exists(out_path):
            exported = True
            print(f"[BL] export method 2 OK")
    except Exception as e2:
        print(f"[BL] method 2: {e2}")

# Method 3: GLTF_SEPARATE
if not exported:
    try:
        sep_path = out_path.replace('.glb', '.gltf')
        bpy.ops.export_scene.gltf(filepath=sep_path, export_format='GLTF_SEPARATE')
        if os.path.exists(sep_path):
            os.rename(sep_path, out_path)
            exported = True
            print(f"[BL] export method 3 OK")
    except Exception as e3:
        print(f"[BL] method 3: {e3}")

# Method 4: wm.gltf_export (newer API)
if not exported:
    try:
        bpy.ops.wm.gltf_export(filepath=out_path)
        if os.path.exists(out_path):
            exported = True
            print(f"[BL] export method 4 OK")
    except Exception as e4:
        print(f"[BL] method 4: {e4}")

if not exported:
    raise RuntimeError("All export methods failed")`,
  fbx: (f) => `bpy.ops.export_scene.fbx(filepath='${f}')`,
  stl: (f) => `bpy.ops.export_mesh.stl(filepath='${f}')`,
  usd: (f) => `bpy.ops.wm.usd_export(filepath='${f}')`,
};

// ---------------------------------------------------------------------------
// Minimal prelude — do NOT touch scene, camera, lighting, or render engine.
// The user script is fully responsible for its own geometry.
// ---------------------------------------------------------------------------
const ASSET_PRELUDE = `
import bpy, os, sys, traceback

# ---- Sanity: only run if we have a scene ----
if bpy.context.scene is None:
    raise RuntimeError("no scene available in headless Blender")

# ---- Clear default scene to give user a blank slate ----
try:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False, confirm=False)
    print("[BL] SCENE_CLEARED")
except Exception as _e:
    print(f"[BL] clear warn: {_e}")
`;

// ---------------------------------------------------------------------------
// Minimal postlude — collect meshes, add fallback if empty, export GLB only.
// No camera, no HDRI, no material override, no preview render.
// ---------------------------------------------------------------------------
const ASSET_POSTLUDE = `
# ---- Collect user geometry ----
_meshes = [o for o in bpy.data.objects
           if o.type == 'MESH' and not o.name.startswith('_')]
print(f"[BL] MESHES={len(_meshes)}")

# ---- Fallback so export never produces an empty file ----
if len(_meshes) == 0:
    print("[BL] FALLBACK: no meshes found, creating placeholder cube")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    _fb = bpy.context.active_object
    _fb.name = "Placeholder_Cube"
    _meshes = [_fb]

# ---- Make sure everything is in the view layer for export ----
for _o in _meshes:
    if _o.name not in bpy.context.scene.collection.objects:
        try:
            bpy.context.scene.collection.objects.link(_o)
        except Exception:
            pass
`;

function indentPython(code) {
  return String(code || '').split('\n').map(l => (l.trim() === '' ? '' : `    ${l}`)).join('\n');
}

// Warn (in GitHub logs) when a user script contains calls the worker already
// handles. These don't fail the job, but they are the #1 cause of "MESHES=0"
// confusion (e.g. own export with use_selection=True exporting nothing).
function scanUserScript(userScript) {
  const patterns = [
    [/bpy\.ops\.export/i, 'own export call (worker exports automatically — remove bpy.ops.export_*)'],
    [/bpy\.ops\.render\.render/i, 'own render call (worker does not render)'],
    [/render\.engine\s*=/i, 'render-engine override (not relevant for asset export)'],
    [/sys\.exit|os\._exit|quit\(|bpy\.ops\.wm\.quit/i, 'exit/quit call (kills the job before export)'],
    [/bpy\.ops\.wm\.read/i, 'scene reload (wipes user geometry)'],
    [/--output-dir|argparse/i, 'CLI-arg parsing (runner calls blender without extra args)'],
  ];
  for (const [re, msg] of patterns) {
    if (re.test(userScript)) console.log(`[BL] USER_WARN: script contains ${msg}`);
  }
}

function buildScript(userCode, outputPath, fmt = 'glb') {
    const safeUser = indentPython(userCode);

    // Optional lint — still useful, but nothing else runs around the user code.
    scanUserScript(userCode);

    const exportCmd = EXPORT_CMD[fmt](outputPath);
    const indentedExport = indentPython(exportCmd);
    const outDir = path.dirname(outputPath);

    const script = `
import bpy, os, sys, traceback

print(f"[BL] blender={bpy.app.version_string}")
print(f"[BL] python={sys.version}")
print(f"[BL] cwd={os.getcwd()}")

# Enable common export addons
for mod in ['io_scene_gltf2', 'io_scene_fbx', 'io_mesh_stl']:
    try:
        bpy.ops.preferences.addon_enable(module=mod)
    except: pass

${ASSET_PRELUDE.trim()}

# 1. Run user script (wrapped in try/except so fallback can still fire if user code fails)
print("[BL] USER_SCRIPT")
sys.stdout.flush()
try:
${safeUser}
    print("[BL] USER_OK")
except Exception as _e:
    traceback.print_exc()
    print(f"[BL] USER_ERROR: {_e}")
sys.stdout.flush()

# 2. Collect meshes and create fallback if needed
${ASSET_POSTLUDE.trim()}

# 3. Export (runs unconditionally OUTSIDE the user try/except)
os.makedirs('${outDir}', exist_ok=True)
print(f"[BL] EXPORT ${outputPath}")
sys.stdout.flush()
try:
${indentedExport}
    print(f"[BL] VERIFY")
    if os.path.exists('${outputPath}'):
        sz = os.path.getsize('${outputPath}')
        print(f"[BL] SIZE={sz}")
        if sz < 50:
            print(f"[BL] WARN: file too small ({sz} bytes)")
    else:
        print(f"[BL] FATAL: no output at ${outputPath}")
        sys.exit(1)
except Exception as _e:
    traceback.print_exc()
    print(f"[BL] EXPORT_ERROR: {_e}")
    sys.exit(1)

print("[BL] DONE")
sys.stdout.flush()
`;

    return script;
}

async function runBlenderScript(scriptPath, fmt) {
  const cmd = `blender --background --factory-startup --python "${scriptPath}" 2>&1`;
  const opts = { encoding: 'utf-8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 };

  try {
    const output = execSync(cmd, opts);
    console.log(`--- Blender ${fmt} STDOUT ---\n${output.slice(-3000)}\n--- END ---`);
    return { success: true, output };
  } catch (e) {
    const out = (e.stdout != null ? String(e.stdout) : '') || '';
    const err = (e.stderr != null ? String(e.stderr) : '') || '';
    const combined = out || err;
    console.log(`--- Blender ${fmt} EXIT code=${e.status} (judge by file, not code) ---`);
    console.log(`STDOUT:\n${combined.slice(-3000)}`);
    console.log(`--- END ---`);
    return { success: false, output: combined, error: combined.slice(-800) };
  }
}

async function uploadToR2(key, filePath, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fs.readFileSync(filePath),
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

function getContentType(fmt) {
  return fmt === 'glb' ? 'model/gltf-binary' : 'application/octet-stream';
}

async function processJob(job) {
  const ref = db.collection('jobs').doc(job.id);
  const runnerRef = db.collection('system').doc('runner');
  
  await ref.update({ status: 'processing', startedAt: Date.now() });
  console.log(`[worker] job ${job.id}`);

  await runnerRef.update({ lastActive: Date.now() });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  const outputs = {};
  let success = 0;
  let lastLogTail = '';

  try {
    for (const fmt of job.formats) {
      if (!EXPORT_CMD[fmt]) { 
        console.log(`[worker] skipping unsupported format: ${fmt}`); 
        continue; 
      }

      const outFile = path.join(workDir, `output.${fmt}`);
      const scriptPath = path.join(workDir, `export_${fmt}.py`);
      scanUserScript(job.script || '');
      fs.writeFileSync(scriptPath, buildScript(job.script, outFile, fmt));

      console.log(`[BL] Running for ${fmt}...`);
      const result = await runBlenderScript(scriptPath, fmt);

      // File-based success: Blender's exit code is unreliable.
      const fileExists = fs.existsSync(outFile);
      const fileSize = fileExists ? fs.statSync(outFile).size : 0;
      if (fileExists) console.log(`[BL] ${fmt} file check: exists, size=${fileSize}`);
      if (!result.success) console.log(`[BL] ${fmt} blender exit != 0 but continuing to file check`);

      if (fileExists && fileSize > 100) {
        const key = `jobs/${job.id}/output.${fmt}`;
        const url = await uploadToR2(key, outFile, getContentType(fmt));
        outputs[fmt] = { url, size: fileSize };
        console.log(`[worker] ${fmt} uploaded: ${url} (${fileSize} bytes)`);
        success++;
      } else {
        console.error(`[worker] ${fmt} export failed (exists=${fileExists}, size=${fileSize})`);
        lastLogTail = (result.output || result.error || '').slice(-800);
        if (result.error) {
          console.error(`   Error: ${result.error}`);
        }
      }
    }

    await ref.update({
      status: success > 0 ? 'done' : 'failed',
      outputs,
      completedAt: Date.now(),
      error: success === 0 ? (`All exports failed${lastLogTail ? ` — ${lastLogTail}` : ''}`.slice(0, 1500)) : null,
    });
    console.log(`[worker] job ${job.id}: ${success > 0 ? 'done' : 'failed'} (${success}/${job.formats.length})`);

  } catch (err) {
    console.error(`Job crashed:`, err);
    await ref.update({ 
      status: 'failed', 
      error: err.message, 
      completedAt: Date.now() 
    });
  } finally {
    await runnerRef.update({ lastActive: Date.now() });
    console.log(`[BL] Cleaning up ${workDir}`);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function markRunner(status, extra = {}) {
  const runnerRef = db.collection('system').doc('runner');
  await runnerRef.set({ status, lastActive: Date.now(), ...extra }, { merge: true });
}

// A node-level crash (uncaught exception / unhandled rejection) would
// otherwise freeze Firestore at 'ready'/'active' forever — the UI then
// shows a live runner for a dead Actions run. Mark inactive first.
let _crashHandlerInstalled = false;
function installCrashHandlers() {
  if (_crashHandlerInstalled) return;
  _crashHandlerInstalled = true;
  const shutdown = async (reason, err) => {
    console.error(`[worker] crashing (${reason}):`, err);
    try {
      await markRunner('inactive', { note: `crashed: ${String((err && err.message) || err).slice(0, 300)}` });
    } catch (e) {
      console.error('Failed to mark runner inactive:', e.message);
    }
    process.exit(1);
  };
  process.on('uncaughtException', (err) => { shutdown('uncaughtException', err); });
  process.on('unhandledRejection', (err) => { shutdown('unhandledRejection', err); });
}

async function getOldestQueuedJob() {
  // Use simple query to avoid requiring composite index
  const snapshot = await db.collection('jobs')
    .where('status', '==', 'queued')
    .get();

  if (snapshot.empty) return null;

  // Sort in-memory by createdAt ascending
  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return docs[0];
}

async function processNextQueuedJob(runnerRef, isProcessingRef, jobCountRef, heartbeatInterval) {
  if (isProcessingRef.current) return false;

  const job = await getOldestQueuedJob();
  if (!job) return false;

  isProcessingRef.current = true;

  try {
    jobCountRef.current++;
    await markRunner('active', { currentJobId: job.id });
    await processJob(job);
    await markRunner('ready', { currentJobId: null });
  } finally {
    isProcessingRef.current = false;
  }

  // Check window expiry
  if (Date.now() - startTime >= WINDOW_MS) {
    console.log(`[worker] window closed, processed ${jobCountRef.current} jobs`);
    clearInterval(heartbeatInterval);
    await markRunner('inactive');
    process.exit(0);
  }

  return true;
}

async function testBlenderExport() {
  const testDir = `/tmp/bl_test_${Date.now()}`;
  fs.mkdirSync(testDir, { recursive: true });
  const testFile = path.join(testDir, 'test.glb');
  const testScript = path.join(testDir, 'test.py');

  const code = `
import bpy, os, sys

print(f"BLENDER={bpy.app.version_string}")

# Enable addon
try:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
except: pass

# List export ops
ops = [o for o in dir(bpy.ops) if 'export' in o.lower() or 'gltf' in o.lower()]
print(f"EXPORT_OPS={ops}")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
bpy.context.active_object.name = "TestCube"
out_f = '${testFile}'
os.makedirs(os.path.dirname(out_f), exist_ok=True)
try:
    bpy.ops.export_scene.gltf(filepath=out_f, export_format='GLB')
    sz = os.path.getsize(out_f)
    print(f"TEST_EXPORT_OK size={sz}")
    if sz < 50:
        print(f"TEST_EXPORT_TOO_SMALL={sz}")
        sys.exit(1)
except Exception as e:
    print(f"TEST_EXPORT_FAIL={e}")
    sys.exit(1)
`;

  fs.writeFileSync(testScript, code);
  try {
    execSync(`blender --background --factory-startup --python "${testScript}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
    const size = fs.statSync(testFile).size;
    console.log(`[worker] pre-flight GLB export ok (${size} bytes)`);
    fs.rmSync(testDir, { recursive: true, force: true });
    return true;
  } catch (e) {
    const out = e.stdout || '';
    console.error(`[worker] pre-flight FAILED:\n${out.slice(-1000)}`);
    fs.rmSync(testDir, { recursive: true, force: true });
    return false;
  }
}

async function main() {
  installCrashHandlers();
  const runnerRef = db.collection('system').doc('runner');
  const now = Date.now();

  console.log(`[worker] started, window: ${WINDOW_MS / 60000}min`);
  console.log(`[worker] runner -> STARTING`);

  // Mark runner as starting (waking up)
  await markRunner('starting', {
    startedAt: now,
    windowEndsAt: now + WINDOW_MS,
    readyAt: null,
    currentJobId: null,
  });

  // ── Initialization phase ──
  // Verify Blender is available
  try {
    const version = execSync('blender --version', { encoding: 'utf-8', timeout: 10000 });
    console.log(`[worker] blender: ${version.split('\n')[0]}`);
  } catch (e) {
    console.error('[worker] blender not found:', e.message);
    await markRunner('inactive');
    process.exit(1);
  }

  // Pre-flight test — make sure GLB export actually works
  const exportOk = await testBlenderExport();
  if (!exportOk) {
    console.error('[worker] pre-flight failed, continuing anyway');
  }

  // Mark runner as ready — can now accept jobs
  await markRunner('ready', { readyAt: Date.now() });
  console.log(`[worker] runner READY, listening for queued jobs`);

  let jobCountRef = { current: 0 };
  let isProcessingRef = { current: false };

  let heartbeatInterval = setInterval(() => {
    markRunner(isProcessingRef.current ? 'active' : 'ready', { currentJobId: null });
  }, 30000);

  // Check for existing queued jobs immediately (catch any that were queued before we started)
  await processNextQueuedJob(runnerRef, isProcessingRef, jobCountRef, heartbeatInterval);

  // Poll for new queued jobs every 10 seconds (avoids composite index requirement)
  const pollInterval = setInterval(async () => {
    try {
      await processNextQueuedJob(runnerRef, isProcessingRef, jobCountRef, heartbeatInterval);
    } catch (err) {
      console.error('Poll error:', err);
    }

    if (Date.now() - startTime >= WINDOW_MS) {
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
      await markRunner('inactive');
      process.exit(0);
    }
  }, 10000);

  // Keep the process alive — main loop handles expiry via pollInterval
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
  }
}

main().catch(async err => {
  console.error('Crashed:', err);
  try {
    await markRunner('inactive', { note: `crashed: ${String((err && err.message) || err).slice(0, 300)}` });
  } catch {}
  process.exit(1);
});
