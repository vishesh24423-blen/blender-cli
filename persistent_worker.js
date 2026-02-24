const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { uploadToR2, getSignedUrl } = require('./upload_r2');

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_CONFIG)
  )
});

const db = admin.firestore();
const WINDOW_MS = (parseInt(process.env.WINDOW_MINUTES) || 355) * 60 * 1000;
const POLL_INTERVAL_MS = 15000; // check every 15 seconds
const startTime = Date.now();

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function processJob(jobDoc) {
  const job = jobDoc.data();
  const jobId = jobDoc.id;
  const formats = job.formats || ['glb']; // default to GLB

  console.log(`⚙️  Processing job: ${jobId} | Formats: ${formats.join(', ')}`);

  // Mark as processing
  await db.collection('system').doc('runner').update({ currentJobId: jobId });
  await jobDoc.ref.update({ status: 'processing' });

  try {
    // Write user script
    fs.writeFileSync('/tmp/job_script.py', job.script);

    // Append export commands for each selected format
    const exportCommands = formats.map(fmt => {
      switch(fmt) {
        case 'glb':  return `bpy.ops.export_scene.gltf(filepath='/tmp/${jobId}.glb', export_format='GLB')`;
        case 'fbx':  return `bpy.ops.export_scene.fbx(filepath='/tmp/${jobId}.fbx')`;
        case 'stl':  return `bpy.ops.export_mesh.stl(filepath='/tmp/${jobId}.stl')`;
        case 'obj':  return `bpy.ops.export_scene.obj(filepath='/tmp/${jobId}.obj')`;
        case 'usd':  return `bpy.ops.wm.usd_export(filepath='/tmp/${jobId}.usdc')`;
        default:     return '';
      }
    }).filter(Boolean);

    fs.appendFileSync('/tmp/job_script.py', `\nimport bpy\n${exportCommands.join('\n')}\n`);

    // Run Blender
    execSync('blender -b --python /tmp/job_script.py', {
      timeout: 120000,
      stdio: 'inherit'
    });

    // Upload each format to R2
    const outputs = {};
    for (const fmt of formats) {
      const filePath = `/tmp/${jobId}.${fmt}`;
      if (fs.existsSync(filePath)) {
        const r2Key = `outputs/${jobId}.${fmt}`;
        await uploadToR2(filePath, r2Key, fmt);
        const url = await getSignedUrl(r2Key);
        const size = fs.statSync(filePath).size;
        outputs[fmt] = { url, size, type: 'single' };
        console.log(`✅ Uploaded ${fmt}: ${(size/1024/1024).toFixed(1)}MB`);
      }
    }

    // Mark job done
    await jobDoc.ref.update({
      status: 'done',
      outputs,
      completedAt: Date.now()
    });

    console.log(`✅ Job ${jobId} completed`);

  } catch (err) {
    console.error(`❌ Job ${jobId} failed:`, err.message);
    await jobDoc.ref.update({
      status: 'failed',
      error: err.message,
      completedAt: Date.now()
    });
  }

  // Clear current job
  await db.collection('system').doc('runner').update({ currentJobId: null });
}

async function pollQueue() {
  console.log(`🚀 Worker started. Window: ${WINDOW_MS / 60000} minutes`);

  while (Date.now() - startTime < WINDOW_MS) {
    const snapshot = await db.collection('jobs')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await processJob(snapshot.docs[0]);
    } else {
      const remaining = Math.round((WINDOW_MS - (Date.now() - startTime)) / 60000);
      console.log(`💤 Queue empty. ${remaining} min remaining. Polling in 15s...`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log('⏱️ Window expired. Shutting down.');
}

pollQueue();
