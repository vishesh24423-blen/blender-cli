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
  glb: (f) => `bpy.ops.export_scene.gltf(filepath='${f}', export_format='GLB', use_selection=False, export_draco_mesh_compression_enable=True, export_materials='EXPORT', export_apply=True)`,
  fbx: (f) => `bpy.ops.export_scene.fbx(filepath='${f}', use_selection=False)`,
  stl: (f) => `bpy.ops.export_mesh.stl(filepath='${f}', use_selection=False)`,
  usd: (f) => `bpy.ops.wm.usd_export(filepath='${f}', selected_objects_only=False)`,
};

function buildScript(userScript, outFile, fmt) {
  const indented = String(userScript || '').split('\n').map(l => `    ${l}`).join('\n');

  return `
import bpy, sys, os, traceback

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

# User script
try:
${indented}
except Exception as e:
    traceback.print_exc(file=sys.stderr)
    print(f"USER_SCRIPT_ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)

# Verify we have mesh objects to export
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
if not mesh_objects:
    print("ERROR: No mesh objects created. Script must create at least one mesh object.", file=sys.stderr)
    sys.exit(1)

print(f"Found {len(mesh_objects)} mesh object(s) to export")

# Export
os.makedirs(os.path.dirname('${outFile}'), exist_ok=True)

try:
    ${EXPORT_CMD[fmt](outFile)}
    print(f"✅ Export completed: ${fmt}")
except Exception as e:
    print(f"EXPORT_ERROR: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;
}

async function processJob(job) {
  const ref = db.collection('jobs').doc(job.id);
  const runnerRef = db.collection('system').doc('runner');
  
  await ref.update({ status: 'processing', startedAt: Date.now() });
  console.log(`▶ Job ${job.id}`);

  await runnerRef.update({ lastActive: Date.now() });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  const outputs = {};
  let success = 0;

  try {
    for (const fmt of job.formats) {
      if (!EXPORT_CMD[fmt]) { 
        console.log(`⏭ Skipping unsupported: ${fmt}`); 
        continue; 
      }

      const outFile = path.join(workDir, `output.${fmt}`);
      const scriptPath = path.join(workDir, `export_${fmt}.py`);
      fs.writeFileSync(scriptPath, buildScript(job.script, outFile, fmt));

      try {
        execSync(`blender --background --python ${scriptPath} 2>&1`, {
          encoding: 'utf-8', 
          timeout: 300_000, 
          maxBuffer: 10 * 1024 * 1024
        });
      } catch (e) {
        console.error(`Blender error (${fmt}):`, e.stdout?.slice(-1000));
      }

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100) {
        const key = `jobs/${job.id}/output.${fmt}`;
        await r2.send(new PutObjectCommand({
          Bucket: BUCKET, 
          Key: key,
          Body: fs.readFileSync(outFile),
          ContentType: fmt === 'glb' ? 'model/gltf-binary' : 'application/octet-stream',
        }));
        outputs[fmt] = { 
          url: `${R2_PUBLIC_URL}/${key}`, 
          size: fs.statSync(outFile).size, 
          expiresAt: Date.now() + 86400000 
        };
        console.log(`✅ ${fmt} → ${outputs[fmt].url}`);
        success++;
      } else {
        console.error(`❌ ${fmt} export failed`);
      }
    }

    await ref.update({
      status: success > 0 ? 'done' : 'failed',
      outputs,
      completedAt: Date.now(),
      error: success === 0 ? 'All exports failed' : null,
    });
    console.log(`✨ Job ${job.id} → ${success > 0 ? 'done' : 'failed'} (${success}/${job.formats.length})`);

  } catch (err) {
    console.error(`Job crashed:`, err);
    await ref.update({ 
      status: 'failed', 
      error: err.message, 
      completedAt: Date.now() 
    });
  } finally {
    await runnerRef.update({ lastActive: Date.now() });
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const runnerRef = db.collection('system').doc('runner');
  const now = Date.now();

  console.log(`🚀 Worker started. Window: ${WINDOW_MS / 60000}min`);
  console.log(`📊 Setting runner to ACTIVE...`);

  // Mark runner as active
  await runnerRef.set({
    status: 'active',
    startedAt: now,
    lastActive: now,
    windowEndsAt: now + WINDOW_MS,
  }, { merge: true });

  let jobCount = 0;
  let isProcessing = false;
  let heartbeatInterval = setInterval(() => {
    runnerRef.update({ lastActive: Date.now() });
  }, 30000);

  // Real-time listener on the jobs collection
  const unsubscribe = db.collection('jobs')
    .where('status', '==', 'queued')
    .orderBy('createdAt', 'asc')
    .onSnapshot(async (snapshot) => {
      // Queue empty → do nothing, no timer, no delay
      if (snapshot.empty || isProcessing) return;

      isProcessing = true;
      const job = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

      try {
        jobCount++;
        await processJob(job);
      } finally {
        isProcessing = false;
      }

      // Window expired → stop listening and exit
      if (Date.now() - startTime >= WINDOW_MS) {
        console.log(`🛑 Window closed. Processed ${jobCount} jobs.`);
        clearInterval(heartbeatInterval);
        unsubscribe();
        await runnerRef.set({ status: 'inactive', lastActive: Date.now() }, { merge: true });
        process.exit(0);
      }
    }, (err) => {
      console.error('Firestore listener error:', err);
    });

  // Keep the process alive until the window expires
  while (Date.now() - startTime < WINDOW_MS) {
    await new Promise(r => setTimeout(r, 1000));
  }

  // Cleanup on window expiry
  console.log(`🛑 Window closed. Processed ${jobCount} jobs.`);
  clearInterval(heartbeatInterval);
  unsubscribe();
  await runnerRef.set({ status: 'inactive', lastActive: Date.now() }, { merge: true });
  process.exit(0);
}

main().catch(err => { console.error('Crashed:', err); process.exit(1); });
