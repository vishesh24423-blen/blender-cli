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
  glb: (f) => `bpy.ops.export_scene.gltf(filepath='${f}', export_format='GLB', use_selection=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_materials='EXPORT', export_colors=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True, export_cameras=False, export_lights=False)`,
  fbx: (f) => `bpy.ops.export_scene.fbx(filepath='${f}', use_selection=False)`,
  stl: (f) => `bpy.ops.export_mesh.stl(filepath='${f}', use_selection=False)`,
  usd: (f) => `bpy.ops.wm.usd_export(filepath='${f}', selected_objects_only=False)`,
};

const QUALITY_PREAMBLE = {
  draft: '',
  standard: `import bpy, os, math
# ══════════════════════════════════════════════════
#  BLENDERLAB QUALITY PREAMBLE — DO NOT EDIT
# ══════════════════════════════════════════════════
# 1. Render engine — EEVEE Next (CPU, no GPU needed)
bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
eevee = bpy.context.scene.eevee
eevee.use_gtao                = True
eevee.gtao_distance           = 0.4
eevee.use_bloom               = True
eevee.bloom_threshold         = 0.70
eevee.bloom_intensity         = 0.45
eevee.bloom_radius            = 6.0
eevee.use_ssr                 = True
eevee.ssr_quality             = 0.5
eevee.use_shadow_high_bitdepth= True
eevee.shadow_cube_size        = '1024'

# 2. Transparent background + RGBA
bpy.context.scene.render.film_transparent = True
bpy.context.scene.render.image_settings.color_mode = 'RGBA'

# 3. Resolution
bpy.context.scene.render.resolution_x          = 1920
bpy.context.scene.render.resolution_y          = 1080
bpy.context.scene.render.resolution_percentage = 100

# 4. HDRI world lighting (IBL)
world = bpy.data.worlds.new("BL_World")
bpy.context.scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
wl = world.node_tree.links
wn.clear()

bg      = wn.new("ShaderNodeBackground")
env     = wn.new("ShaderNodeTexEnvironment")
mapping = wn.new("ShaderNodeMapping")
texco   = wn.new("ShaderNodeTexCoord")
wo      = wn.new("ShaderNodeOutputWorld")

hdr_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'studio_small_03_1k.hdr')
if os.path.exists(hdr_path):
    env.image = bpy.data.images.load(hdr_path)
    print(f"[BL] HDRI loaded: {hdr_path}")
else:
    print(f"[BL] WARNING: HDRI not found at {hdr_path}, using white world")
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.85, 1.0)

bg.inputs['Strength'].default_value = 2.0
wl.new(texco.outputs['Generated'], mapping.inputs['Vector'])
wl.new(mapping.outputs['Vector'], env.inputs['Vector'])
wl.new(env.outputs['Color'],      bg.inputs['Color'])
wl.new(bg.outputs['Background'],  wo.inputs['Surface'])

# 5. Camera — hero shot, auto-frames after geometry is created
cam_data = bpy.data.cameras.new("BL_Cam")
cam_data.lens              = 85
cam_data.dof.use_dof       = True
cam_data.dof.aperture_fstop = 2.8
cam_obj  = bpy.data.objects.new("BL_Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_obj.location       = (0, -6, 2)
cam_obj.rotation_euler = (math.radians(75), 0, 0)

# 6. Shadow catcher ground plane
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.01))
_sc = bpy.context.active_object
_sc.name             = "_ShadowCatcher"
_sc.is_shadow_catcher = True
_sc.visible_diffuse  = False

print("[BL] Preamble complete — running user script...")
# ══════════════════════════════════════════════════
`,
  cinematic: `import bpy, os, math
# ══════════════════════════════════════════════════
#  BLENDERLAB CINEMATIC PREAMBLE — DO NOT EDIT
# ══════════════════════════════════════════════════
# 1. Render engine — EEVEE Next (CPU, no GPU needed)
bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
eevee = bpy.context.scene.eevee
eevee.use_gtao                = True
eevee.gtao_distance           = 0.4
eevee.use_bloom               = True
eevee.bloom_threshold         = 0.70
eevee.bloom_intensity         = 0.6
eevee.bloom_radius            = 8.0
eevee.use_ssr                 = True
eevee.ssr_quality             = 0.5
eevee.use_shadow_high_bitdepth= True
eevee.shadow_cube_size        = '2048'
eevee.use_volumetric_lights   = True
eevee.use_volumetric_shadows  = True

# 2. Transparent background + RGBA
bpy.context.scene.render.film_transparent = True
bpy.context.scene.render.image_settings.color_mode = 'RGBA'

# 3. Resolution - 4K
bpy.context.scene.render.resolution_x          = 3840
bpy.context.scene.render.resolution_y          = 2160
bpy.context.scene.render.resolution_percentage = 100

# 4. HDRI world lighting (IBL)
world = bpy.data.worlds.new("BL_World")
bpy.context.scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
wl = world.node_tree.links
wn.clear()

bg      = wn.new("ShaderNodeBackground")
env     = wn.new("ShaderNodeTexEnvironment")
mapping = wn.new("ShaderNodeMapping")
texco   = wn.new("ShaderNodeTexCoord")
wo      = wn.new("ShaderNodeOutputWorld")

hdr_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'studio_small_03_1k.hdr')
if os.path.exists(hdr_path):
    env.image = bpy.data.images.load(hdr_path)
    print(f"[BL] HDRI loaded: {hdr_path}")
else:
    print(f"[BL] WARNING: HDRI not found at {hdr_path}, using white world")
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.85, 1.0)

bg.inputs['Strength'].default_value = 2.0
wl.new(texco.outputs['Generated'], mapping.inputs['Vector'])
wl.new(mapping.outputs['Vector'], env.inputs['Vector'])
wl.new(env.outputs['Color'],      bg.inputs['Color'])
wl.new(bg.outputs['Background'],  wo.inputs['Surface'])

# 5. Camera — hero shot with shallow DOF
cam_data = bpy.data.cameras.new("BL_Cam")
cam_data.lens              = 85
cam_data.dof.use_dof       = True
cam_data.dof.aperture_fstop = 1.8
cam_obj  = bpy.data.objects.new("BL_Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_obj.location       = (0, -6, 2)
cam_obj.rotation_euler = (math.radians(75), 0, 0)

# 6. Shadow catcher ground plane
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.01))
_sc = bpy.context.active_object
_sc.name             = "_ShadowCatcher"
_sc.is_shadow_catcher = True
_sc.visible_diffuse  = False

print("[BL] Cinematic preamble complete — running user script...")
# ══════════════════════════════════════════════════
`
};

const QUALITY_POSTPASS = {
  draft: '',
  standard: `
# ══════════════════════════════════════════════════
#  BLENDERLAB POST-PASS — DO NOT EDIT
# ══════════════════════════════════════════════════
import bpy, mathutils

print("[BL] Running post-pass...")

SPLINE_PALETTE = [
    (0.10, 0.18, 0.95),   # electric blue
    (0.52, 0.08, 0.95),   # deep purple
    (0.04, 0.72, 0.88),   # cyan
    (0.92, 0.22, 0.52),   # pink
    (0.08, 0.88, 0.52),   # mint
    (0.95, 0.45, 0.05),   # amber
]

mesh_objects = [o for o in bpy.data.objects 
                if o.type == 'MESH' and not o.name.startswith('_')]

for idx, obj in enumerate(mesh_objects):
    # ── Ensure material exists ──
    if obj.data.materials:
        mat = obj.data.materials[0]
    else:
        mat = bpy.data.materials.new(f"BL_Mat_{idx}")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf  = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    
    # ── Color: only override if still default grey ──
    col = bsdf.inputs['Base Color'].default_value
    is_grey = (abs(col[0]-0.8)<0.08 and abs(col[1]-0.8)<0.08 and abs(col[2]-0.8)<0.08)
    if is_grey:
        r,g,b = SPLINE_PALETTE[idx % len(SPLINE_PALETTE)]
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    
    # ── Spline PBR signature ──
    bsdf.inputs['Roughness'].default_value = 0.18
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.85
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value    = 0.55
        bsdf.inputs['Coat Roughness'].default_value = 0.05
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value   = 0.04
    
    # ── Smooth shading ──
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()

# ── AUTO-FRAME CAMERA ──────────────────────────────────────
if mesh_objects:
    inf = float('inf')
    mn  = mathutils.Vector(( inf,  inf,  inf))
    mx  = mathutils.Vector((-inf, -inf, -inf))
    for ob in mesh_objects:
        for corner in ob.bound_box:
            w = ob.matrix_world @ mathutils.Vector(corner)
            mn = mathutils.Vector((min(mn.x,w.x), min(mn.y,w.y), min(mn.z,w.z)))
            mx = mathutils.Vector((max(mx.x,w.x), max(mx.y,w.y), max(mx.z,w.z)))
    
    center   = (mn + mx) / 2
    diagonal = (mx - mn).length
    distance = max(diagonal * 2.2, 1.5)
    
    cam = bpy.context.scene.camera
    cam.location = (center.x, center.y - distance, center.z + distance * 0.38)
    direction    = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    cam.data.dof.focus_distance = distance
    print(f"[BL] Camera auto-framed: distance={distance:.2f}, center={center}")

# ── COMPOSITOR: bloom + chromatic aberration ───────────────
scene = bpy.context.scene
scene.use_nodes = True
tree  = scene.node_tree
tree.nodes.clear()

rl    = tree.nodes.new("CompositorNodeRLayers"); rl.location    = (-500, 0)
glare = tree.nodes.new("CompositorNodeGlare");   glare.location = (-200, 80)
lens  = tree.nodes.new("CompositorNodeLensdist");lens.location  = (100, 80)
comp  = tree.nodes.new("CompositorNodeComposite");comp.location = (400, 0)

glare.glare_type = 'FOG_GLOW'
glare.threshold  = 0.70
glare.size       = 8
glare.quality    = 'HIGH'

lens.inputs['Distortion'].default_value  = 0.0
lens.inputs['Dispersion'].default_value  = 0.020

tree.links.new(rl.outputs['Image'],  glare.inputs['Image'])
tree.links.new(glare.outputs['Image'], lens.inputs['Image'])
tree.links.new(lens.outputs['Image'],  comp.inputs['Image'])
tree.links.new(rl.outputs['Alpha'],    comp.inputs['Alpha'])

print("[BL] Post-pass complete ✅")
# ══════════════════════════════════════════════════
`,
  cinematic: `
# ══════════════════════════════════════════════════
#  BLENDERLAB CINEMATIC POST-PASS — DO NOT EDIT
# ══════════════════════════════════════════════════
import bpy, mathutils

print("[BL] Running cinematic post-pass...")

SPLINE_PALETTE = [
    (0.10, 0.18, 0.95),   # electric blue
    (0.52, 0.08, 0.95),   # deep purple
    (0.04, 0.72, 0.88),   # cyan
    (0.92, 0.22, 0.52),   # pink
    (0.08, 0.88, 0.52),   # mint
    (0.95, 0.45, 0.05),   # amber
]

mesh_objects = [o for o in bpy.data.objects 
                if o.type == 'MESH' and not o.name.startswith('_')]

for idx, obj in enumerate(mesh_objects):
    # ── Ensure material exists ──
    if obj.data.materials:
        mat = obj.data.materials[0]
    else:
        mat = bpy.data.materials.new(f"BL_Mat_{idx}")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf  = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    
    # ── Color: only override if still default grey ──
    col = bsdf.inputs['Base Color'].default_value
    is_grey = (abs(col[0]-0.8)<0.08 and abs(col[1]-0.8)<0.08 and abs(col[2]-0.8)<0.08)
    if is_grey:
        r,g,b = SPLINE_PALETTE[idx % len(SPLINE_PALETTE)]
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    
    # ── Spline PBR signature ──
    bsdf.inputs['Roughness'].default_value = 0.18
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.85
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value    = 0.55
        bsdf.inputs['Coat Roughness'].default_value = 0.05
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value   = 0.04
    
    # ── Smooth shading ──
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()

# ── AUTO-FRAME CAMERA ──────────────────────────────────────
if mesh_objects:
    inf = float('inf')
    mn  = mathutils.Vector(( inf,  inf,  inf))
    mx  = mathutils.Vector((-inf, -inf, -inf))
    for ob in mesh_objects:
        for corner in ob.bound_box:
            w = ob.matrix_world @ mathutils.Vector(corner)
            mn = mathutils.Vector((min(mn.x,w.x), min(mn.y,w.y), min(mn.z,w.z)))
            mx = mathutils.Vector((max(mx.x,w.x), max(mx.y,w.y), max(mx.z,w.z)))
    
    center   = (mn + mx) / 2
    diagonal = (mx - mn).length
    distance = max(diagonal * 2.2, 1.5)
    
    cam = bpy.context.scene.camera
    cam.location = (center.x, center.y - distance, center.z + distance * 0.38)
    direction    = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    cam.data.dof.focus_distance = distance
    print(f"[BL] Camera auto-framed: distance={distance:.2f}, center={center}")

# ── COMPOSITOR: bloom + chromatic aberration ───────────────
scene = bpy.context.scene
scene.use_nodes = True
tree  = scene.node_tree
tree.nodes.clear()

rl    = tree.nodes.new("CompositorNodeRLayers"); rl.location    = (-500, 0)
glare = tree.nodes.new("CompositorNodeGlare");   glare.location = (-200, 80)
lens  = tree.nodes.new("CompositorNodeLensdist");lens.location  = (100, 80)
comp  = tree.nodes.new("CompositorNodeComposite");comp.location = (400, 0)

glare.glare_type = 'FOG_GLOW'
glare.threshold  = 0.70
glare.size       = 8
glare.quality    = 'HIGH'

lens.inputs['Distortion'].default_value  = 0.0
lens.inputs['Dispersion'].default_value  = 0.020

tree.links.new(rl.outputs['Image'],  glare.inputs['Image'])
tree.links.new(glare.outputs['Image'], lens.inputs['Image'])
tree.links.new(lens.outputs['Image'],  comp.inputs['Image'])
tree.links.new(rl.outputs['Alpha'],    comp.inputs['Alpha'])

print("[BL] Cinematic post-pass complete ✅")
# ══════════════════════════════════════════════════
`
};

function buildScript(userScript, outFile, fmt, quality = 'standard') {
  const indented = String(userScript || '').split('\n').map(l => `    ${l}`).join('\n');
  const preamble = QUALITY_PREAMBLE[quality] || QUALITY_PREAMBLE.standard;
  const postpass = QUALITY_POSTPASS[quality] || QUALITY_POSTPASS.standard;

  return `
import bpy, sys, os, traceback

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

${preamble}

# User script
try:
${indented}
except Exception as e:
    traceback.print_exc(file=sys.stderr)
    print(f"USER_SCRIPT_ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)

${postpass}

# Verify we have mesh objects to export
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH' and not obj.name.startswith('_')]
if not mesh_objects:
    print("ERROR: No mesh objects created. Script must create at least one mesh object.", file=sys.stderr)
    sys.exit(1)

print(f"Found {len(mesh_objects)} mesh object(s) to export")

# Render preview PNG
if '${quality}' != 'draft':
    bpy.context.scene.render.resolution_x = 1200
    bpy.context.scene.render.resolution_y = 800
    bpy.context.scene.render.filepath     = '${path.dirname(outFile)}/preview.png'
    bpy.ops.render.render(write_still=True)
    print("[BL] Preview PNG rendered")

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
  const quality = job.quality || 'standard';

  try {
    for (const fmt of job.formats) {
      if (!EXPORT_CMD[fmt]) { 
        console.log(`⏭ Skipping unsupported: ${fmt}`); 
        continue; 
      }

      const outFile = path.join(workDir, `output.${fmt}`);
      const scriptPath = path.join(workDir, `export_${fmt}.py`);
      fs.writeFileSync(scriptPath, buildScript(job.script, outFile, fmt, quality));

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

    // Upload preview PNG if it exists
    const previewPath = path.join(workDir, 'preview.png');
    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 100) {
      const previewKey = `jobs/${job.id}/preview.png`;
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET, 
        Key: previewKey,
        Body: fs.readFileSync(previewPath),
        ContentType: 'image/png',
      }));
      outputs.preview = `${R2_PUBLIC_URL}/${previewKey}`;
      console.log(`🖼️ Preview → ${outputs.preview}`);
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

async function markRunner(status, extra = {}) {
  const runnerRef = db.collection('system').doc('runner');
  await runnerRef.set({ status, lastActive: Date.now(), ...extra }, { merge: true });
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
    console.log(`🛑 Window closed. Processed ${jobCountRef.current} jobs.`);
    clearInterval(heartbeatInterval);
    await markRunner('inactive');
    process.exit(0);
  }

  return true;
}

async function main() {
  const runnerRef = db.collection('system').doc('runner');
  const now = Date.now();

  console.log(`🚀 Worker started. Window: ${WINDOW_MS / 60000}min`);
  console.log(`📊 Setting runner to STARTING...`);

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
    console.log(`✅ Blender: ${version.split('\n')[0]}`);
  } catch (e) {
    console.error('❌ Blender not found:', e.message);
    await markRunner('inactive');
    process.exit(1);
  }

  // Verify HDRI assets
  const hdrPath = path.join(__dirname, 'assets', 'studio_small_03_1k.hdr');
  if (fs.existsSync(hdrPath)) {
    console.log(`✅ HDRI asset found: ${hdrPath}`);
  } else {
    console.warn(`⚠️ HDRI not found, will use fallback lighting`);
  }

  // Mark runner as ready — can now accept jobs
  await markRunner('ready', { readyAt: Date.now() });
  console.log(`✅ Runner is READY — listening for queued jobs`);

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

main().catch(err => { console.error('Crashed:', err); process.exit(1); });
