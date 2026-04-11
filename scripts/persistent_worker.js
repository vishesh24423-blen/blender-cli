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
  glb: (f) => `bpy.ops.export_scene.gltf(filepath='${f}', export_format='GLB', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_materials='EXPORT', export_colors=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True, export_cameras=False, export_lights=False)`,
  fbx: (f) => `bpy.ops.export_scene.fbx(filepath='${f}')`,
  stl: (f) => `bpy.ops.export_mesh.stl(filepath='${f}')`,
  usd: (f) => `bpy.ops.wm.usd_export(filepath='${f}')`,
};

const SPLINE_PREAMBLE = `import bpy
import os

# ── SPLINE QUALITY SETUP ──────────────────────────────────────────
# 1. Transparent background
bpy.context.scene.render.film_transparent = True
bpy.context.scene.render.image_settings.color_mode = 'RGBA'

# 2. Render engine — EEVEE (Blender 5.1+)
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
eevee = bpy.context.scene.eevee
eevee.use_gtao = True
eevee.gtao_distance = 0.5
eevee.use_bloom = True
eevee.bloom_threshold = 0.8
eevee.bloom_intensity = 0.3
eevee.bloom_radius = 5.0
eevee.use_ssr = True
eevee.use_ssr_halfres = False
eevee.use_shadow_high_bitdepth = True

# 3. Resolution
bpy.context.scene.render.resolution_x = 1920
bpy.context.scene.render.resolution_y = 1080
bpy.context.scene.render.resolution_percentage = 100

# 4. HDRI world lighting (IBL — the #1 visual quality lever)
world = bpy.data.worlds.new("SplineWorld")
bpy.context.scene.world = world
world.use_nodes = True
w_nodes = world.node_tree.nodes
w_links = world.node_tree.links
w_nodes.clear()

bg = w_nodes.new("ShaderNodeBackground")
env_tex = w_nodes.new("ShaderNodeTexEnvironment")
tex_coord = w_nodes.new("ShaderNodeTexCoord")
mapping = w_nodes.new("ShaderNodeMapping")
output = w_nodes.new("ShaderNodeOutputWorld")

# Try to load bundled HDRI (downloaded in CI at scripts/assets/studio_small_03_1k.hdr)
hdr_path = os.path.join(os.path.dirname(__file__), 'assets', 'studio_small_03_1k.hdr')
if os.path.exists(hdr_path):
    env_tex.image = bpy.data.images.load(hdr_path)
    bg.inputs['Strength'].default_value = 1.8
else:
    # Fallback: pure white world background so renders don't fail
    env_tex.image = None
    bg.inputs['Strength'].default_value = 0.5

w_links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])
w_links.new(mapping.outputs['Vector'], env_tex.inputs['Vector'])
w_links.new(env_tex.outputs['Color'], bg.inputs['Color'])
w_links.new(bg.outputs['Background'], output.inputs['Surface'])

# 5. Camera — positioned for hero shot
cam_data = bpy.data.cameras.new("SplineCam")
cam_data.lens = 85
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8
cam_obj = bpy.data.objects.new("SplineCam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_obj.location = (0, -6, 2)
cam_obj.rotation_euler = (1.309, 0, 0)

# 6. Ground plane — shadow catcher only (invisible, catches object shadow)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -1.05))
shadow_plane = bpy.context.active_object
shadow_plane.name = "_ShadowCatcher"
shadow_plane.is_shadow_catcher = True
shadow_plane.visible_camera = True
shadow_plane.visible_diffuse = False

print("✅ Spline quality setup complete")
# ── END SETUP ─────────────────────────────────────────────────────
`;

const SPLINE_MATERIAL_UPGRADE = `
# ── SPLINE MATERIAL UPGRADE PASS ─────────────────────────────────
import bpy
import mathutils

SPLINE_PALETTE = [
    (0.12, 0.08, 0.95),
    (0.55, 0.10, 0.95),
    (0.05, 0.75, 0.85),
    (0.95, 0.30, 0.55),
    (0.10, 0.90, 0.55),
]

mesh_objects = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('_')]

for idx, obj in enumerate(mesh_objects):
    if obj.data.materials:
        mat = obj.data.materials[0]
    else:
        mat = bpy.data.materials.new(f"SplineMat_{idx}")
        mat.use_nodes = True
        obj.data.materials.append(mat)

    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")

    current_color = bsdf.inputs['Base Color'].default_value
    is_default_grey = all(abs(current_color[i] - 0.8) < 0.05 for i in range(3))
    if is_default_grey:
        r, g, b = SPLINE_PALETTE[idx % len(SPLINE_PALETTE)]
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)

    bsdf.inputs['Roughness'].default_value = 0.15
    bsdf.inputs['Specular IOR Level'].default_value = 0.8
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = 0.6
        bsdf.inputs['Coat Roughness'].default_value = 0.05
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value = 0.05

    if idx == 0:
        cam = bpy.context.scene.camera
        if cam:
            world_center = obj.matrix_world @ mathutils.Vector(obj.location)
            dist = (cam.location - world_center).length
            cam.data.dof.focus_distance = max(dist, 0.1)

    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()

# ── AUTO-FRAME CAMERA ────────────────────────────────────────────
mesh_obs = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('_')]
if mesh_obs:
    min_co = mathutils.Vector((float('inf'),)*3)
    max_co = mathutils.Vector((float('-inf'),)*3)
    for ob in mesh_obs:
        for corner in ob.bound_box:
            world = ob.matrix_world @ mathutils.Vector(corner)
            min_co = mathutils.Vector(map(min, zip(min_co, world)))
            max_co = mathutils.Vector(map(max, zip(max_co, world)))

    center = (min_co + max_co) / 2
    diagonal = (max_co - min_co).length
    distance = diagonal * 2.2

    cam = bpy.context.scene.camera
    if cam:
        cam.location = (center.x, center.y - distance, center.z + distance * 0.35)
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        cam.data.dof.focus_distance = distance

# ── COMPOSITOR: bloom + chromatic aberration + vignette ──────────
scene = bpy.context.scene
scene.use_nodes = True
tree = scene.node_tree
tree.nodes.clear()

rl = tree.nodes.new("CompositorNodeRLayers")
rl.location = (-400, 0)

glare = tree.nodes.new("CompositorNodeGlare")
glare.glare_type = 'FOG_GLOW'
glare.threshold = 0.85
glare.size = 7
glare.location = (-100, 100)

lens = tree.nodes.new("CompositorNodeLensdist")
lens.inputs['Distortion'].default_value = 0.0
lens.inputs['Dispersion'].default_value = 0.025
lens.location = (150, 100)

comp = tree.nodes.new("CompositorNodeComposite")
comp.location = (400, 0)

tree.links.new(rl.outputs['Image'], glare.inputs['Image'])
tree.links.new(glare.outputs['Image'], lens.inputs['Image'])
tree.links.new(lens.outputs['Image'], comp.inputs['Image'])
tree.links.new(rl.outputs['Alpha'], comp.inputs['Alpha'])

print("✅ Material upgrade + compositor complete")
# ── END POST PASS ─────────────────────────────────────────────────
`;

function buildScript(userScript, outFile, fmt, workDir, quality = 'standard') {
  const indented = String(userScript || '').split('\n').map(l => `    ${l}`).join('\n');

  // Check for draft override in script comments
  const hasDraftOverride = userScript.includes('# blenderlab:quality=draft');
  const effectiveQuality = hasDraftOverride ? 'draft' : quality;

  let preamble = '';
  let postPass = '';

  if (effectiveQuality === 'standard') {
    preamble = SPLINE_PREAMBLE;
    postPass = SPLINE_MATERIAL_UPGRADE;
  } else if (effectiveQuality === 'cinematic') {
    // Cinematic: standard + stronger bloom + 4K render
    preamble = SPLINE_PREAMBLE.replace(
      "eevee.bloom_intensity = 0.3",
      "eevee.bloom_intensity = 0.6"
    ).replace(
      "bpy.context.scene.render.resolution_x = 1920\nbpy.context.scene.render.resolution_y = 1080",
      "bpy.context.scene.render.resolution_x = 3840\nbpy.context.scene.render.resolution_y = 2160"
    );
    postPass = SPLINE_MATERIAL_UPGRADE;
  }
  // 'draft' gets no preamble or post-pass

  return `
import bpy, sys, os, traceback

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

try:
${preamble.split('\n').map(l => `    ${l}`).join('\n')}
${indented}
${postPass.split('\n').map(l => `    ${l}`).join('\n')}
except Exception as e:
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

# ── PREVIEW THUMBNAIL ─────────────────────────────────────────────
try:
    if effectiveQuality != 'draft':
        bpy.context.scene.render.resolution_x = 1200
        bpy.context.scene.render.resolution_y = 800
        bpy.context.scene.render.filepath = '${workDir}/preview.png'
        bpy.context.scene.render.image_settings.file_format = 'PNG'
        bpy.context.scene.render.image_settings.color_mode = 'RGBA'
        bpy.ops.render.render(write_still=True)
        print("✅ Preview thumbnail rendered")
except Exception as e:
    print(f"Preview render warning: {e}", file=sys.stderr)
# ── END PREVIEW ───────────────────────────────────────────────────

os.makedirs(os.path.dirname('${outFile}'), exist_ok=True)

try:
    ${EXPORT_CMD[fmt](outFile)}
except Exception as e:
    print(f"EXPORT_ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
}

async function processJob(job) {
  const ref = db.collection('jobs').doc(job.id);
  const runnerRef = db.collection('system').doc('runner');
  
  await ref.update({ status: 'processing', startedAt: Date.now() });
  console.log(`▶ Job ${job.id}`);

  // Update runner heartbeat before processing
  await runnerRef.update({ lastActive: Date.now() });

  const workDir = `/tmp/job_${job.id}`;
  fs.mkdirSync(workDir, { recursive: true });

  const outputs = {};
  let success = 0;
  const quality = job.quality || 'standard';

  try {
    for (const fmt of job.formats) {
      if (!EXPORT_CMD[fmt]) { console.log(`⏭ Skipping unsupported: ${fmt}`); continue; }

      const outFile = path.join(workDir, `output.${fmt}`);
      const scriptPath = path.join(workDir, `export_${fmt}.py`);
      fs.writeFileSync(scriptPath, buildScript(job.script, outFile, fmt, workDir, quality));

      try {
        execSync(`blender --background --python ${scriptPath} 2>&1`, {
          encoding: 'utf-8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024
        });
      } catch (e) {
        console.error(`Blender error (${fmt}):`, e.stdout?.slice(-1000));
      }

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100) {
        const key = `jobs/${job.id}/output.${fmt}`;
        await r2.send(new PutObjectCommand({
          Bucket: BUCKET, Key: key,
          Body: fs.readFileSync(outFile),
          ContentType: fmt === 'glb' ? 'model/gltf-binary' : 'application/octet-stream',
        }));
        outputs[fmt] = { url: `${R2_PUBLIC_URL}/${key}`, size: fs.statSync(outFile).size, expiresAt: Date.now() + 86400000 };
        console.log(`✅ ${fmt} → ${outputs[fmt].url}`);
        success++;
      } else {
        console.error(`❌ ${fmt} export failed`);
      }
    }

    // Upload preview thumbnail if it exists
    const previewPath = path.join(workDir, 'preview.png');
    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 100) {
      const previewKey = `jobs/${job.id}/preview.png`;
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET, Key: previewKey,
        Body: fs.readFileSync(previewPath),
        ContentType: 'image/png',
      }));
      outputs.preview = { url: `${R2_PUBLIC_URL}/${previewKey}`, expiresAt: Date.now() + 86400000 };
      console.log(`🖼️ Preview → ${outputs.preview.url}`);
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
    await ref.update({ status: 'failed', error: err.message, completedAt: Date.now() });
  } finally {
    // Update runner heartbeat after processing
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
