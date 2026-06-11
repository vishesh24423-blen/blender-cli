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
  const outDir = path.dirname(outFile);
  const exportCmd = EXPORT_CMD[fmt](outFile);

  return `
import bpy, sys, os, traceback

# ── Debug ──
print(f"[BL] blender={bpy.app.version_string}")
print(f"[BL] python={sys.version}")
print(f"[BL] cwd={os.getcwd()}")

# Enable common export addons
for mod in ['io_scene_gltf2', 'io_scene_fbx', 'io_mesh_stl']:
    try:
        bpy.ops.preferences.addon_enable(module=mod)
    except: pass

# ── Clear default scene ──
try:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False, confirm=False)
except Exception as e:
    print(f"[BL] clear warn: {e}")

# 2. Run user script
print("[BL] USER_SCRIPT")
sys.stdout.flush()
try:
${indented}
    print("[BL] USER_OK")
except Exception as e:
    traceback.print_exc()
    print(f"USER_ERROR: {e}")
    sys.exit(1)
sys.stdout.flush()

# 3. Collect mesh objects
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('_')]
print(f"[BL] MESHES={len(meshes)}")
sys.stdout.flush()

# 4. Fallback if user created nothing
if not meshes:
    print("[BL] FALLBACK")
    try:
        bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
        bpy.context.active_object.name = "BL_Fallback"
        meshes = [bpy.context.active_object]
    except Exception as e:
        print(f"FALLBACK_ERROR: {e}")
        sys.exit(1)

# 5. Smooth shading
for o in meshes:
    try:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth()
    except:
        pass

# 6. Export
out_file = '${outFile}'
os.makedirs('${outDir}', exist_ok=True)
print(f"[BL] EXPORT {out_file}")
sys.stdout.flush()
try:
    ${exportCmd}
    print(f"[BL] VERIFY")
    if os.path.exists(out_file):
        sz = os.path.getsize(out_file)
        print(f"[BL] SIZE={sz}")
        if sz < 50:
            print(f"[BL] WARN: file too small ({sz} bytes)")
    else:
        print(f"FATAL: no output at {out_file}")
        sys.exit(1)
except Exception as e:
    traceback.print_exc()
    print(f"EXPORT_ERR: {e}")
    sys.exit(1)

print("[BL] DONE")
sys.stdout.flush()
`;
}

async function runBlenderScript(scriptPath, fmt) {
  const cmd = `blender --background --python "${scriptPath}" 2>&1`;
  const opts = { encoding: 'utf-8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 };
  
  try {
    const output = execSync(cmd, opts);
    console.log(`--- Blender ${fmt} STDOUT ---\n${output.slice(-3000)}\n--- END ---`);
    return { success: true, output };
  } catch (e) {
    const out = e.stdout || '';
    const err = e.stderr || '';
    console.log(`--- Blender ${fmt} FAIL (code=${e.status}) ---`);
    console.log(`STDOUT:\n${out.slice(-2000)}`);
    if (err) console.log(`STDERR:\n${err.slice(-2000)}`);
    console.log(`--- END ---`);
    return { success: false, output: out, error: (err || out).slice(-500) };
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

      console.log(`[BL] Running for ${fmt}...`);
      const result = await runBlenderScript(scriptPath, fmt);

      if (result.success && fs.existsSync(outFile) && fs.statSync(outFile).size > 100) {
        const key = `jobs/${job.id}/output.${fmt}`;
        const url = await uploadToR2(key, outFile, getContentType(fmt));
        outputs[fmt] = { url, size: fs.statSync(outFile).size };
        console.log(`✅ ${fmt} → ${url} (${fs.statSync(outFile).size} bytes)`);
        success++;
      } else {
        console.error(`❌ ${fmt} export failed`);
        if (result.error) {
          console.error(`   Error: ${result.error}`);
        }
      }
    }

    // Upload preview PNG if it exists
    const previewPath = path.join(workDir, 'preview.png');
    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 100) {
      const previewKey = `jobs/${job.id}/preview.png`;
      const url = await uploadToR2(previewKey, previewPath, 'image/png');
      outputs.preview = url;
      console.log(`🖼️ Preview → ${url}`);
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
    console.log(`[BL] Cleaning up ${workDir}`);
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
    execSync(`blender --background --python "${testScript}" 2>&1`, { encoding: 'utf-8', timeout: 60000 });
    const size = fs.statSync(testFile).size;
    console.log(`✅ Pre-flight test: GLB export works (${size} bytes)`);
    fs.rmSync(testDir, { recursive: true, force: true });
    return true;
  } catch (e) {
    const out = e.stdout || '';
    console.error(`❌ Pre-flight test FAILED:\n${out.slice(-1000)}`);
    fs.rmSync(testDir, { recursive: true, force: true });
    return false;
  }
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

  // Pre-flight test — make sure GLB export actually works
  const exportOk = await testBlenderExport();
  if (!exportOk) {
    console.error('❌ Pre-flight export test failed — will still attempt jobs but expect failures');
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
