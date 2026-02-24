const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Init Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
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
  const exportLines = {
    glb: `bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB')`,
    fbx: `bpy.ops.export_scene.fbx(filepath='${outFile}')`,
    stl: `bpy.ops.export_mesh.stl(filepath='${outFile}')`,
    obj: `bpy.ops.export_scene.obj(filepath='${outFile}')`,
    usd: `bpy.ops.wm.usd_export(filepath='${outFile}')`,
  };

  return `
import bpy
import sys

${script}

try:
    ${exportLines[fmt]}
    print("EXPORT_SUCCESS: ${fmt}")
except Exception as e:
    print(f"EXPORT_ERROR: {e}", file=sys.stderr)
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

  try {
    for (const fmt of job.formats) {
      const outFile = path.join(workDir, `output.${fmt}`);
      const exportScriptPath = path.join(workDir, `export_${fmt}.py`);

      fs.writeFileSync(exportScriptPath, buildExportScript(job.script, outFile, fmt));

      try {
        execSync(
          `blender --background --python ${exportScriptPath}`,
          { stdio: 'pipe', timeout: 5 * 60 * 1000 }
        );
      } catch (blenderErr) {
        console.error(`Blender error for ${fmt}:`, blenderErr.stderr?.toString());
      }

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        const key = `jobs/${job.id}/output.${fmt}`;
        const fileSize = fs.statSync(outFile).size;

        await r2.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fs.readFileSync(outFile),
          ContentType: 'application/octet-stream',
        }));

        outputs[fmt] = {
          url: `https://${BUCKET}.r2.dev/${key}`,
          size: fileSize,
        };

        console.log(`✅ Uploaded ${fmt}: ${outputs[fmt].url} (${fileSize} bytes)`);
      } else {
        console.error(`❌ Export failed for ${fmt} - file not created`);
      }
    }

    const status = Object.keys(outputs).length > 0 ? 'done' : 'failed';

    await jobRef.update({
      status,
      outputs,
      completedAt: Date.now(),
      error: status === 'failed' ? 'All exports failed' : null,
    });

    console.log(`Job ${job.id} → ${status}`);

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
