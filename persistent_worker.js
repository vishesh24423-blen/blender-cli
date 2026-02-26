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
    // Blender 5.x glTF exporter - correct parameters
    glb: `
print("DEBUG: Attempting GLB export...", file=sys.stderr)
print(f"DEBUG: Objects selected: {len([o for o in bpy.context.selected_objects])}", file=sys.stderr)
print(f"DEBUG: Objects in scene: {len(bpy.data.objects)}", file=sys.stderr)
try:
    print("DEBUG: Trying export (selection mode)...", file=sys.stderr)
    bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB', use_selection=True)
    print("EXPORT_SUCCESS: glb (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selection export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene export...", file=sys.stderr)
    try:
        bpy.ops.export_scene.gltf(filepath='${outFile}', export_format='GLB', use_selection=False)
        print("EXPORT_SUCCESS: glb (full)", file=sys.stderr)
    except Exception as e2:
        print(f"ERROR: Both export attempts failed: {e2}", file=sys.stderr)
        raise

if os.path.exists('${outFile}'):
    print(f"DEBUG: GLB file created, size: {os.path.getsize('${outFile}')} bytes", file=sys.stderr)
else:
    print("ERROR: GLB file was not created after export!", file=sys.stderr)
`,
    fbx: `
print("DEBUG: Attempting FBX export...", file=sys.stderr)
try:
    print("DEBUG: Trying export (selection mode)...", file=sys.stderr)
    bpy.ops.export_scene.fbx(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: fbx (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selection export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene...", file=sys.stderr)
    try:
        bpy.ops.export_scene.fbx(filepath='${outFile}', use_selection=False)
        print("EXPORT_SUCCESS: fbx (full)", file=sys.stderr)
    except Exception as e2:
        print(f"ERROR: Both FBX exports failed: {e2}", file=sys.stderr)
        raise
`,
    stl: `
print("DEBUG: Attempting STL export...", file=sys.stderr)
try:
    print("DEBUG: Trying export (selection mode)...", file=sys.stderr)
    bpy.ops.export_mesh.stl(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: stl (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selection export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene...", file=sys.stderr)
    try:
        bpy.ops.export_mesh.stl(filepath='${outFile}', use_selection=False)
        print("EXPORT_SUCCESS: stl (full)", file=sys.stderr)
    except Exception as e2:
        print(f"ERROR: Both STL exports failed: {e2}", file=sys.stderr)
        raise
`,
    obj: `
print("DEBUG: Attempting OBJ export...", file=sys.stderr)
try:
    print("DEBUG: Trying export (selection mode)...", file=sys.stderr)
    bpy.ops.export_scene.obj(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: obj (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selection export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene...", file=sys.stderr)
    try:
        bpy.ops.export_scene.obj(filepath='${outFile}', use_selection=False)
        print("EXPORT_SUCCESS: obj (full)", file=sys.stderr)
    except Exception as e2:
        print(f"ERROR: Both OBJ exports failed: {e2}", file=sys.stderr)
        raise
`,
    usd: `
print("DEBUG: Attempting USD export...", file=sys.stderr)
try:
    print("DEBUG: Trying export (selection mode)...", file=sys.stderr)
    bpy.ops.wm.usd_export(filepath='${outFile}', use_selection=True)
    print("EXPORT_SUCCESS: usd (selective)", file=sys.stderr)
except Exception as e:
    print(f"DEBUG: Selection export failed: {e}", file=sys.stderr)
    print("DEBUG: Falling back to full scene...", file=sys.stderr)
    try:
        bpy.ops.wm.usd_export(filepath='${outFile}', use_selection=False)
        print("EXPORT_SUCCESS: usd (full)", file=sys.stderr)
    except Exception as e2:
        print(f"ERROR: Both USD exports failed: {e2}", file=sys.stderr)
        raise
`,
  };

  return `
import bpy
import sys
import traceback
import os

print("=" * 60, file=sys.stderr)
print("BLENDER EXPORT SCRIPT STARTING", file=sys.stderr)
print("=" * 60, file=sys.stderr)

# Clear default scene (Cube, Camera, Light)
print("DEBUG: Clearing default scene...", file=sys.stderr)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

# Ensure we have a valid collection for scripts to link to
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
    print(f"USER_SCRIPT_ERROR:", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    print("-" * 60, file=sys.stderr)
    print(f"Script failed. No objects created. Export will fail.", file=sys.stderr)

# Ensure a collection exists after user script 
# (in case they deleted everything)
if not bpy.data.collections:
    print("DEBUG: No collections exist, creating Collection...", file=sys.stderr)
    bpy.data.collections.new("Collection")
    bpy.context.scene.collection.children.link(bpy.data.collections[0])

# Deselect all first
print("DEBUG: Deselecting all objects...", file=sys.stderr)
bpy.ops.object.select_all(action='DESELECT')

# Select all objects across all collections for export
print("DEBUG: Selecting exportable objects...", file=sys.stderr)
mesh_count = 0
for obj in bpy.data.objects:
    obj_type = obj.type
    if obj.type in ('MESH', 'CURVE', 'SURFACE', 'GPENCIL', 'ARMATURE'):
        obj.select_set(True)
        mesh_count += 1
        print(f"  - Selected: {obj.name} ({obj.type})", file=sys.stderr)

print(f"Objects ready for export: {mesh_count}", file=sys.stderr)

# Verify there is something to export
if mesh_count == 0:
    print("ERROR: No exportable objects in scene!", file=sys.stderr)
    print("Available objects:", file=sys.stderr)
    for obj in bpy.data.objects:
        print(f"  - {obj.name} (type: {obj.type})", file=sys.stderr)
    sys.exit(1)

# Ensure output directory exists
print(f"DEBUG: Output will be written to: '${outFile}'", file=sys.stderr)
out_dir = os.path.dirname('${outFile}')
if out_dir:
    os.makedirs(out_dir, exist_ok=True)
    print(f"DEBUG: Created/verified directory: {out_dir}", file=sys.stderr)

print("DEBUG: Starting export...", file=sys.stderr)
try:
    ${exportLines[fmt]}
except Exception as e:
    print(f"CRITICAL_EXPORT_ERROR: {fmt}", file=sys.stderr)
    print(f"Exception: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

print("=" * 60, file=sys.stderr)
print("EXPORT COMPLETED", file=sys.stderr)
print("=" * 60, file=sys.stderr)
`;
}

async function processJob(job) {
  const jobRef = db.collection('jobs').doc(job.id);
  console.log(`Processing job: ${job.id}`);

  await jobRef.update({ status: 'processing', startedAt: Date.now() });

  // Heartbeat/Status update
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
        console.log(`⏭️  Skipping OBJ format (Blender 5.x snap issue)`);
        continue;
      }

      const outFile = path.join(workDir, `output.${fmt}`);
      const exportScriptPath = path.join(workDir, `export_${fmt}.py`);

      console.log(`\n📝 Building export script for ${fmt}...`);
      const exportScript = buildExportScript(job.script, outFile, fmt);
      fs.writeFileSync(exportScriptPath, exportScript);

      // Proactive heartbeat before starting Blender (it might take a while)
      await db.collection('system').doc('runner').update({
        lastActive: Date.now(),
      }).catch(e => console.error('Early heartbeat update failed:', e));

      console.log(`⚙️  Running Blender for ${fmt}...`);
      let blenderOutput = '';
      let blenderError = '';

      try {
        const result = execSync(
          `blender --background --python ${exportScriptPath} 2>&1`,
          { 
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 300 * 1000,  // 5min timeout
            cwd: workDir,
            maxBuffer: 10 * 1024 * 1024  // 10MB buffer
          }
        );
        blenderOutput = result;
        console.log(`[Blender output for ${fmt}]:\n${result}`);
      } catch (blenderErr) {
        blenderOutput = blenderErr.stdout?.toString() || '';
        blenderError = blenderErr.stderr?.toString() || blenderErr.toString();
        console.error(`[Blender error for ${fmt}]:\n${blenderError}`);
      }

      // Check if export succeeded
      if (fs.existsSync(outFile)) {
        const fileSize = fs.statSync(outFile).size;
        console.log(`📦 Export file created: ${outFile} (${fileSize} bytes)`);

        // Minimum file size check (100 bytes to account for minimal valid files)
        if (fileSize > 100) {
          const key = `jobs/${job.id}/output.${fmt}`;

          const contentTypes = {
            glb: 'model/gltf-binary',
            fbx: 'application/octet-stream',
            stl: 'model/stl',
            usd: 'application/octet-stream',
          };

          console.log(`📤 Uploading ${fmt} to R2...`);
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

          // Lightweight heartbeat update during loop
          await db.collection('system').doc('runner').update({
            lastActive: Date.now(),
          }).catch(e => console.error('Heartbeat update failed:', e));
        } else {
          console.error(`❌ Export file too small for ${fmt}: ${fileSize} bytes`);
          errors.push(`${fmt}: File too small (${fileSize} bytes)`);
        }
      } else {
        console.error(`❌ Export failed for ${fmt} - file not created`);
        
        // Extract diagnostic info from Blender output
        const errorDetails = [];
        
        if (blenderOutput.includes('No exportable objects in scene')) {
          errorDetails.push('No mesh objects created by script');
        }
        if (blenderOutput.includes('USER_SCRIPT_ERROR')) {
          errorDetails.push('Script crashed - check syntax');
        }
        if (blenderOutput.includes('CRITICAL_EXPORT_ERROR')) {
          errorDetails.push('Export command failed');
        }
        
        // Count selected objects from debug output
        const selectedMatch = blenderOutput.match(/Objects ready for export: (\d+)/);
        if (selectedMatch && selectedMatch[1] === '0') {
          errorDetails.push('No objects selected for export');
        }
        
        const finalError = errorDetails.length > 0 
          ? `${fmt}: ${errorDetails.join(' | ')}`
          : `${fmt}: Export failed - check Blender output for details`;
        
        errors.push(finalError);
        
        // Log full Blender output for debugging
        if (blenderOutput) {
          console.log(`📋 Full Blender Output for ${fmt}:`);
          console.log(blenderOutput.substring(0, 2000)); // First 2000 chars
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

    console.log(`\n✨ Job ${job.id} → ${status} (${successCount}/${job.formats.length} formats)`);

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
  console.log(`🚀 Worker started. Window: ${WINDOW_MS / 60000} minutes`);
  console.log('📁 Supported Formats: GLB / FBX / STL / USD');
  console.log('⚠️  OBJ format disabled (Blender 5.0+ snap issue)\n');

  while (Date.now() - startTime < WINDOW_MS) {
    // Basic idle heartbeat
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
      console.log('⏳ No queued jobs. Waiting 30s...');
      await new Promise(res => setTimeout(res, 30000));
    }
  }

  console.log('🛑 Worker window closing.');
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
