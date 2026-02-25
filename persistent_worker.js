const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Init Firebase
// Prefer FIREBASE_CONFIG (used in GitHub Actions), but fall back to FIREBASE_SERVICE_ACCOUNT_KEY for local runs
const serviceAccountJson = process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
  throw new Error('Missing Firebase config: set FIREBASE_CONFIG or FIREBASE_SERVICE_ACCOUNT_KEY');
}
const serviceAccount = JSON.parse(serviceAccountJson);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// Init R2
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

async function getNextJob() {
  const snap = await db.collection('jobs')
    .where('status', '==', 'queued')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

function buildExportScript(script, outFile, fmt) {
  // Normalize and patch user script for Blender 5.x
  const rawScript = script == null ? '' : String(script);
  // Replace legacy glTF param everywhere: export_selected → use_selection
  const patchedScript = rawScript.replace(/export_selected/g, 'use_selection');

  // Indent user script so it can live inside a try: block
  const indentedScript = patchedScript
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');

  const exportLines = {
    // Blender 5.x: use_selection instead of export_selected
    glb: `bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB', use_selection=True, export_materials='EXPORT')`,
    fbx: `bpy.ops.export_scene.fbx(filepath='${outFile}', use_selection=True)`,
    stl: `bpy.ops.export_mesh.stl(filepath='${outFile}', use_selection=True)`,
    obj: `bpy.ops.wm.obj_export(filepath='${outFile}', export_selected_objects=True, export_materials=True)`,
    usd: `bpy.ops.wm.usd_export(filepath='${outFile}', selected_objects_only=True)`,
  };

  return `
import bpy
import sys

bpy.ops.object.select_all(action='DESELECT')

try:
${indentedScript}
except Exception as e:
    print(f"USER_SCRIPT_ERROR: {e}", file=sys.stderr)

bpy.context.view_layer.objects.active = bpy.context.active_object
bpy.context.active_object.select_set(True)

try:
    ${exportLines[fmt]}
    print("EXPORT_SUCCESS: ${fmt}")
except Exception as e:
    print(f"EXPORT_ERROR: ${fmt}: {e}", file=sys.stderr)
    sys.exit(1)
`;
}

async function processJob(job) {
  const jobRef = db.collection('jobs').doc(job.id);
  console.log(`Processing job: ${job.id}`);

  await jobRef.update({ status: 'processing', startedAt: Date.now() });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  const outputs = {};
  let successCount = 0;

  try {
    for (const fmt of job.formats) {
      if (fmt === 'obj') continue;  // ❌ SKIP OBJ - broken in Blender 5.0 snap

      const outFile = path.join(workDir, `output.${fmt}`);
      const exportScriptPath = path.join(workDir, `export_${fmt}.py`);

      fs.writeFileSync(exportScriptPath, buildExportScript(job.script, outFile, fmt));

      try {
        execSync(
          `blender --background --python ${exportScriptPath}`,
          { stdio: 'pipe', timeout: 120 * 1000, cwd: workDir }  // 2min timeout
        );
      } catch (blenderErr) {
        console.error(`Blender error for ${fmt}:`, blenderErr.stderr?.toString());
      }

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
        const key = `jobs/${job.id}/output.${fmt}`;
        const fileSize = fs.statSync(outFile).size;

        const contentTypes = {
          glb: 'model/gltf-binary',
          fbx: 'application/octet-stream',
          stl: 'model/stl',
          usd: 'application/octet-stream',
        };

        await r2.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fs.readFileSync(outFile),
          ContentType: contentTypes[fmt] || 'application/octet-stream',
        }));

        outputs[fmt] = {
          url: `${R2_PUBLIC_URL}/${key}`,
          size: fileSize,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };

        console.log(`✅ Uploaded ${fmt}: ${outputs[fmt].url} (${fileSize} bytes)`);
        successCount++;
      } else {
        console.error(`❌ Export failed for ${fmt} - file not created`);
      }
    }

    const status = successCount > 0 ? 'done' : 'failed';

    await jobRef.update({
      status,
      outputs,
      completedAt: Date.now(),
      error: status === 'failed' ? 'No valid exports created (GLB recommended)' : null,
    });

    console.log(`Job ${job.id} → ${status} (${successCount}/${job.formats.length} formats)`);

  } catch (err) {
    console.error(`Job ${job.id} crashed:`, err);
    await jobRef.update({
      status: 'failed',
      error: err.message,
      completedAt: Date.now(),
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Worker started. Window: ${WINDOW_MS / 60000} minutes`);
  console.log('Formats: GLB/FBX/STL/USD only (OBJ disabled - Blender 5.0 bug)');

  while (Date.now() - startTime < WINDOW_MS) {
    const job = await getNextJob();

    if (job) {
      await processJob(job);
    } else {
      console.log('No queued jobs. Waiting 30s...');
      await new Promise(res => setTimeout(res, 30000));
    }
  }

  console.log('Worker window closing.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
