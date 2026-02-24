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
const WINDOW_MS = (parseInt(process.env.WINDOW_MINUTES || '355') - 5) * 60 * 1000;
const startTime = Date.now();

async function getNextJob() {
  const snap = await db.collection('jobs')
    .where('status', '==', 'queued')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function processJob(job) {
  const jobRef = db.collection('jobs').doc(job.id);
  console.log(`Processing job: ${job.id}`);

  // Mark as processing
  await jobRef.update({ status: 'processing', startedAt: Date.now() });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  // Write script
  const scriptPath = path.join(workDir, 'script.py');
  fs.writeFileSync(scriptPath, job.script);

  const outputs = {};

  try {
    for (const fmt of job.formats) {
      const outFile = path.join(workDir, `output.${fmt}`);

      // Add export command to script
      const exportScript = `
${job.script}

import bpy
bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB') if '${fmt}' == 'glb' else None
bpy.ops.export_scene.fbx(filepath='${outFile}') if '${fmt}' == 'fbx' else None
bpy.ops.export_mesh.stl(filepath='${outFile}') if '${fmt}' == 'stl' else None
bpy.ops.export_scene.obj(filepath='${outFile}') if '${fmt}' == 'obj' else None
`;
      const exportScriptPath = path.join(workDir, `export_${fmt}.py`);
      fs.writeFileSync(exportScriptPath, exportScript);

      // Run Blender headless
      execSync(
        `blender --background --python ${exportScriptPath}`,
        { stdio: 'inherit', timeout: 5 * 60 * 1000 }
      );

      if (fs.existsSync(outFile)) {
        // Upload to R2
        const key = `jobs/${job.id}/output.${fmt}`;
        await r2.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fs.readFileSync(outFile),
          ContentType: 'application/octet-stream',
        }));

        outputs[fmt] = `https://${BUCKET}.r2.dev/${key}`;
        console.log(`Uploaded ${fmt}: ${outputs[fmt]}`);
      }
    }

    await jobRef.update({
      status: 'done',
      outputs,
      completedAt: Date.now(),
    });
    console.log(`Job ${job.id} completed`);

  } catch (err) {
    console.error(`Job ${job.id} failed:`, err);
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
