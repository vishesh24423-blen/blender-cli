const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Init Firebase
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  FIX 1: exportLines values are standalone blocks (no wrapping
//          try: in the footer template). Each block owns its
//          own try/except so indentation is self-contained.
//
//  FIX 2: exportLines strings now start with a real statement
//          (not a leading newline), avoiding empty try: bodies.
//
//  FIX 3: Footer template embeds exportLines directly at top
//          level â€” NO surrounding try: wrapper.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildExportScript(script, outFile, fmt) {
  const rawScript = script == null ? '' : String(script);
  const patchedScript = rawScript.replace(/export_selected/g, 'use_selection');

  // Indent user script for the try: block inside the template
  const indentedScript = patchedScript
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');

  // â”€â”€ Each format block is self-contained with its own try/except â”€â”€
  // IMPORTANT: no leading blank line â€” first char must be a statement
  const exportBlocks = {
    glb: `\
print("DEBUG: Attempting GLB export...", file=sys.stderr)
print(f"DEBUG: Objects selected: {len(bpy.context.selected_objects)}", file=sys.stderr)
print(f"DEBUG: Objects in scene: {len(bpy.data.objects)}", file=sys.stderr)
try:
    bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB', export_selected_only=True, export_materials=True)
    print("EXPORT_SUCCESS: glb (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selective export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene export...", file=sys.stderr)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB', export_selected_only=False, export_materials=True)
    print("EXPORT_SUCCESS: glb (full)", file=sys.stderr)
if os.path.exists('${outFile}'):
    print(f"DEBUG: GLB file created, size: {os.path.getsize('${outFile}')} bytes", file=sys.stderr)
else:
    print("ERROR: GLB file was not created after export!", file=sys.stderr)
`,

    fbx: `\
print("DEBUG: Attempting FBX export...", file=sys.stderr)
try:
    bpy.ops.export_scene.fbx(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: fbx (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selective export failed: {e}", file=sys.stderr)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(filepath='${outFile}', use_selection=False)
    print("EXPORT_SUCCESS: fbx (full)", file=sys.stderr)
`,

    stl: `\
print("DEBUG: Attempting STL export...", file=sys.stderr)
try:
    bpy.ops.export_mesh.stl(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: stl (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selective export failed: {e}", file=sys.stderr)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_mesh.stl(filepath='${outFile}', use_selection=False)
    print("EXPORT_SUCCESS: stl (full)", file=sys.stderr)
`,

    obj: `\
print("DEBUG: Attempting OBJ export...", file=sys.stderr)
try:
    bpy.ops.wm.obj_export(filepath='${outFile}', export_selected_objects=True, export_materials=True)
    print("EXPORT_SUCCESS: obj (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selective export failed: {e}", file=sys.stderr)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.obj_export(filepath='${outFile}', export_selected_objects=False, export_materials=True)
    print("EXPORT_SUCCESS: obj (full)", file=sys.stderr)
`,

    usd: `\
print("DEBUG: Attempting USD export...", file=sys.stderr)
try:
    bpy.ops.wm.usd_export(filepath='${outFile}', selected_objects_only=True)
    print("EXPORT_SUCCESS: usd (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selective export failed: {e}", file=sys.stderr)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.usd_export(filepath='${outFile}', selected_objects_only=False)
    print("EXPORT_SUCCESS: usd (full)", file=sys.stderr)
`,
  };

  const exportBlock = exportBlocks[fmt] || `print("ERROR: Unknown format ${fmt}", file=sys.stderr)\nsys.exit(1)\n`;

  // â”€â”€ Template: exportBlock is placed at TOP LEVEL (not inside try:) â”€â”€
  return `\
import bpy
import sys
import traceback
import os

print("=" * 60, file=sys.stderr)
print("BLENDER EXPORT SCRIPT STARTING", file=sys.stderr)
print("=" * 60, file=sys.stderr)

print("DEBUG: Clearing default scene...", file=sys.stderr)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

print("DEBUG: Setting up collection...", file=sys.stderr)
if not bpy.context.collection:
    col = bpy.data.collections.get("Collection") or bpy.data.collections.new("Collection")
    if "Collection" not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)

print("DEBUG: Running user script...", file=sys.stderr)
try:
${indentedScript}
except Exception as e:
    print("-" * 60, file=sys.stderr)
    print("USER_SCRIPT_ERROR:", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    print("-" * 60, file=sys.stderr)

if not bpy.data.collections:
    print("DEBUG: No collections exist, creating Collection...", file=sys.stderr)
    col = bpy.data.collections.new("Collection")
    bpy.context.scene.collection.children.link(col)

print("DEBUG: Deselecting all objects...", file=sys.stderr)
bpy.ops.object.select_all(action='DESELECT')

print("DEBUG: Selecting exportable objects...", file=sys.stderr)
mesh_count = 0
for obj in bpy.data.objects:
    if obj.type in ('MESH', 'CURVE', 'SURFACE', 'GPENCIL', 'ARMATURE'):
        obj.select_set(True)
        mesh_count += 1
        print(f"  - Selected: {obj.name} ({obj.type})", file=sys.stderr)

print(f"Objects ready for export: {mesh_count}", file=sys.stderr)

if mesh_count == 0:
    print("ERROR: No exportable objects in scene!", file=sys.stderr)
    for obj in bpy.data.objects:
        print(f"  - {obj.name} (type: {obj.type})", file=sys.stderr)
    sys.exit(1)

out_dir = os.path.dirname('${outFile}')
if out_dir:
    os.makedirs(out_dir, exist_ok=True)
    print(f"DEBUG: Created/verified directory: {out_dir}", file=sys.stderr)

print("DEBUG: Starting export...", file=sys.stderr)
${exportBlock}
print("=" * 60, file=sys.stderr)
print("EXPORT COMPLETED", file=sys.stderr)
print("=" * 60, file=sys.stderr)
`;
}

async function getNextJob() {
  const snap = await db.collection('jobs')
    .where('status', '==', 'queued')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function processJob(job) {
  const jobRef = db.collection('jobs').doc(job.id);
  console.log(`Processing job: ${job.id}`);

  await jobRef.update({ status: 'processing', startedAt: Date.now() });

  await db.collection('system').doc('runner').set({
    status: 'active',
    lastActive: Date.now(),
    startedAt: startTime,
    windowEndsAt: startTime + WINDOW_MS,
    currentJobId: job.id
  }, { merge: true });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  const outputs = {};
  const errors = [];
  let successCount = 0;

  try {
    for (const fmt of job.formats) {
      if (fmt === 'obj') {
        console.log(`â­ï¸  Skipping OBJ format (Blender 5.x snap issue)`);
        continue;
      }

      const outFile = path.join(workDir, `output.${fmt}`);
      const exportScriptPath = path.join(workDir, `export_${fmt}.py`);

      console.log(`\nðŸ“ Building export script for ${fmt}...`);
      const exportScript = buildExportScript(job.script, outFile, fmt);
      fs.writeFileSync(exportScriptPath, exportScript);

      await db.collection('system').doc('runner').update({
        lastActive: Date.now(),
      }).catch(e => console.error('Early heartbeat update failed:', e));

      console.log(`âš™ï¸  Running Blender for ${fmt}...`);
      let blenderOutput = '';

      try {
        blenderOutput = execSync(
          `blender --background --python ${exportScriptPath} 2>&1`,
          {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 300 * 1000,
            cwd: workDir,
            maxBuffer: 10 * 1024 * 1024,
          }
        );
        console.log(`[Blender output for ${fmt}]:\n${blenderOutput}`);
      } catch (blenderErr) {
        blenderOutput = (blenderErr.stdout || '') + (blenderErr.stderr || '') || blenderErr.toString();
        console.error(`[Blender error for ${fmt}]:\n${blenderOutput}`);
      }

      if (fs.existsSync(outFile)) {
        const fileSize = fs.statSync(outFile).size;
        console.log(`ðŸ“¦ Export file created: ${outFile} (${fileSize} bytes)`);

        if (fileSize > 100) {
          const key = `jobs/${job.id}/output.${fmt}`;
          const contentTypes = {
            glb: 'model/gltf-binary',
            fbx: 'application/octet-stream',
            stl: 'model/stl',
            usd: 'application/octet-stream',
          };

          console.log(`ðŸ“¤ Uploading ${fmt} to R2...`);
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

          console.log(`âœ… Uploaded ${fmt}: ${outputs[fmt].url} (${fileSize} bytes)`);
          successCount++;

          await db.collection('system').doc('runner').update({
            lastActive: Date.now(),
          }).catch(e => console.error('Heartbeat update failed:', e));
        } else {
          console.error(`âŒ Export file too small for ${fmt}: ${fileSize} bytes`);
          errors.push(`${fmt}: File too small (${fileSize} bytes)`);
        }
      } else {
        console.error(`âŒ Export failed for ${fmt} - file not created`);

        const errorDetails = [];
        if (blenderOutput.includes('No exportable objects in scene')) errorDetails.push('No mesh objects created by script');
        if (blenderOutput.includes('USER_SCRIPT_ERROR'))              errorDetails.push('Script crashed - check syntax');
        if (blenderOutput.includes('CRITICAL_EXPORT_ERROR'))          errorDetails.push('Export command failed');
        const selectedMatch = blenderOutput.match(/Objects ready for export: (\d+)/);
        if (selectedMatch && selectedMatch[1] === '0')                 errorDetails.push('No objects selected for export');

        errors.push(errorDetails.length > 0
          ? `${fmt}: ${errorDetails.join(' | ')}`
          : `${fmt}: Export failed - check Blender output for details`
        );

        if (blenderOutput) {
          console.log(`ðŸ“‹ Full Blender Output for ${fmt}:`);
          console.log(blenderOutput.substring(0, 2000));
        }
      }
    }

    const status = successCount > 0 ? 'done' : 'failed';
    const errorMsg = errors.length > 0
      ? errors.join(' | ')
      : (successCount === 0 ? 'No valid exports created. Check your script for errors.' : null);

    await jobRef.update({
      status,
      outputs,
      completedAt: Date.now(),
      error: errorMsg,
    });

    console.log(`\nâœ¨ Job ${job.id} â†’ ${status} (${successCount}/${job.formats.length} formats)`);

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
  console.log(`ðŸš€ Worker started. Window: ${WINDOW_MS / 60000} minutes`);
  console.log('ðŸ“ Supported Formats: GLB / FBX / STL / USD');
  console.log('âš ï¸  OBJ format disabled (Blender 5.0+ snap issue)\n');

  while (Date.now() - startTime < WINDOW_MS) {
    await db.collection('system').doc('runner').set({
      status: 'active',
      lastActive: Date.now(),
      startedAt: startTime,
      windowEndsAt: startTime + WINDOW_MS
    }, { merge: true });

    const job = await getNextJob();

    if (job) {
      await processJob(job);
    } else {
      console.log('â³ No queued jobs. Waiting 30s...');
      await new Promise(res => setTimeout(res, 30000));
    }
  }

  console.log('ðŸ›‘ Worker window closing.');
  await db.collection('system').doc('runner').set({
    status: 'inactive',
    lastActive: Date.now()
  }, { merge: true });
  process.exit(0);
}

main().catch((err) => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
