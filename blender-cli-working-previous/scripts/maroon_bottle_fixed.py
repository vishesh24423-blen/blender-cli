# ============================================================
#  Maroon Plastic Bottle — Blender Python Script (bpy)
#  Run inside Blender > Scripting Tab or via BlenderLab
#  Bottle inspired by: embossed lower-body contour water bottle
# ============================================================

import bpy
import math
import bmesh
from mathutils import Vector

# ── 0. CLEAN SCENE ──────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)
for col in bpy.data.collections:
    bpy.data.collections.remove(col)

# Ensure Collection exists
if "Collection" not in bpy.data.collections:
    bpy.data.collections.new("Collection")

main_collection = bpy.data.collections["Collection"]
if "Collection" not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(main_collection)

# ── 1. BOTTLE PROFILE (half cross-section, X=radius, Z=height) ──
# Units in Blender metres; bottle ≈ 24 cm tall, ~7 cm max radius
profile_verts = [
    # (radius, height)  — bottom → top
    (0.000, 0.000),   # centre base
    (0.034, 0.000),   # outer base edge
    (0.036, 0.005),   # base bevel out
    (0.035, 0.012),   # base cylinder start
    (0.036, 0.030),   # slight flare at bottom
    (0.035, 0.055),   # lower body
    (0.036, 0.080),   # lower mid
    (0.036, 0.095),   # widest point (grip top)
    (0.034, 0.110),   # upper mid slight taper
    (0.033, 0.135),   # shoulder start
    (0.028, 0.165),   # shoulder curve
    (0.020, 0.195),   # neck base
    (0.017, 0.215),   # neck shaft
    (0.017, 0.225),   # neck top (thread base)
    (0.018, 0.228),   # thread lip out
    (0.016, 0.232),   # thread lip in
    (0.000, 0.232),   # close top
]

# ── 2. CREATE PROFILE CURVE & SCREW MODIFIER ────────────────
curve_data = bpy.data.curves.new('BottleProfile', type='CURVE')
curve_data.dimensions = '2D'
spline = curve_data.splines.new('POLY')
spline.points.add(len(profile_verts) - 1)

for i, (r, z) in enumerate(profile_verts):
    spline.points[i].co = (r, 0.0, z, 1.0)

profile_obj = bpy.data.objects.new('_Profile', curve_data)
main_collection.objects.link(profile_obj)
bpy.context.view_layer.objects.active = profile_obj
profile_obj.select_set(True)

# Screw modifier → revolve 360° around Z
screw = profile_obj.modifiers.new('Revolve', 'SCREW')
screw.axis          = 'Z'
screw.steps         = 64
screw.render_steps  = 64
screw.screw_offset  = 0.0
screw.angle         = math.radians(360)
screw.use_merge_vertices = True

# Convert to mesh
bpy.ops.object.convert(target='MESH')
bottle = bpy.context.active_object
bottle.name = 'BottleBody'

# Smooth shading
bpy.ops.object.shade_smooth()

# ── 3. EMBOSSED PANEL DETAIL (lower 45% of body) ─────────────
# We use BMesh to loop-cut and extrude inward to fake emboss
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(bottle.data)

# Select faces in the lower emboss zone (z < 0.095)
emboss_faces = [f for f in bm.faces
                if all(v.co.z < 0.096 and v.co.z > 0.010 for v in f.verts)]

# Subdivide those faces to add resolution for emboss panels
if emboss_faces:
    bmesh.ops.subdivide_edges(
        bm,
        edges=list({e for f in emboss_faces for e in f.edges}),
        cuts=2,
        use_grid_fill=True,
    )

    # Inset + push inward to create rectangular panel feel
    result = bmesh.ops.inset_region(
        bm,
        faces=emboss_faces,
        thickness=0.0018,
        depth=-0.0010,
        use_boundary=True,
        use_even_offset=True,
    )

bmesh.update_edit_mesh(bottle.data)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

# ── 4. BOTTLE MATERIAL — translucent maroon plastic ──────────
def make_plastic_material(name, base_color, roughness=0.25,
                          transmission=0.55, ior=1.49):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out   = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf  = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out.location  = (400, 0)
    bsdf.location = (0, 0)

    bsdf.inputs['Base Color'].default_value      = base_color
    bsdf.inputs['Roughness'].default_value        = roughness
    bsdf.inputs['IOR'].default_value              = ior

    # Blender 4.x uses 'Transmission Weight'; 3.x uses 'Transmission'
    for key in ('Transmission Weight', 'Transmission'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = transmission
            break

    # Bump map to simulate emboss surface detail
    tex_coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping   = nt.nodes.new('ShaderNodeMapping')
    wave      = nt.nodes.new('ShaderNodeTexWave')
    bump      = nt.nodes.new('ShaderNodeBump')

    tex_coord.location = (-800, -200)
    mapping.location   = (-600, -200)
    wave.location      = (-350, -200)
    bump.location      = (-100, -100)

    wave.wave_type                       = 'BANDS'
    wave.bands_direction                 = 'DIAGONAL'
    wave.inputs['Scale'].default_value      = 14.0
    wave.inputs['Distortion'].default_value = 1.5
    wave.inputs['Detail'].default_value     = 6.0
    bump.inputs['Strength'].default_value   = 0.6
    bump.inputs['Distance'].default_value   = 0.003

    nt.links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'],   wave.inputs['Vector'])
    nt.links.new(wave.outputs['Color'],        bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'],       bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'],         out.inputs['Surface'])
    return mat

maroon_body = make_plastic_material(
    'MaroonBottle',
    base_color=(0.48, 0.07, 0.12, 1.0),   # dark crimson-maroon
    roughness=0.22,
    transmission=0.55,
)
bottle.data.materials.append(maroon_body)

# ── 5. SCREW CAP ─────────────────────────────────────────────
bpy.ops.mesh.primitive_cylinder_add(
    vertices=48,
    radius=0.019,
    depth=0.022,
    location=(0, 0, 0.243),
)
cap = bpy.context.active_object
cap.name = 'BottleCap'

# Link to main collection
main_collection.objects.link(cap)

# Bevel top/bottom edges
bevel = cap.modifiers.new('Bevel', 'BEVEL')
bevel.width    = 0.002
bevel.segments = 3
bevel.limit_method = 'ANGLE'

# Knurling texture on cap using displacement
bpy.ops.object.modifier_add(type='DISPLACE')
disp = cap.modifiers[-1]
tex = bpy.data.textures.new('CapKnurl', type='MUSGRAVE')
tex.musgrave_type = 'RIDGED_MULTIFRACTAL'
tex.noise_scale   = 0.4
disp.texture      = tex
disp.strength     = 0.0008
disp.texture_coords = 'OBJECT'

bpy.ops.object.shade_smooth()

# Cap material — opaque dark maroon
cap_mat = make_plastic_material(
    'CapMaterial',
    base_color=(0.28, 0.04, 0.08, 1.0),
    roughness=0.55,
    transmission=0.0,
)
cap.data.materials.append(cap_mat)

# ── 6. WORLD + HDRI-STYLE BACKGROUND ─────────────────────────
world = bpy.context.scene.world
world.use_nodes = True
wnt = world.node_tree
wnt.nodes['Background'].inputs['Color'].default_value    = (0.9, 0.88, 0.85, 1.0)
wnt.nodes['Background'].inputs['Strength'].default_value = 1.2

# ── 7. LIGHTS ────────────────────────────────────────────────
# Key light
bpy.ops.object.light_add(type='AREA', location=(0.4, -0.5, 0.4))
key = bpy.context.active_object
key.name = 'KeyLight'
key.data.energy = 400
key.data.size   = 0.6
key.rotation_euler = (math.radians(50), 0, math.radians(35))
main_collection.objects.link(key)

# Fill light
bpy.ops.object.light_add(type='AREA', location=(-0.35, -0.3, 0.25))
fill = bpy.context.active_object
fill.name = 'FillLight'
fill.data.energy = 120
fill.data.size   = 1.0
main_collection.objects.link(fill)

# Rim light
bpy.ops.object.light_add(type='SPOT', location=(0.1, 0.5, 0.4))
rim = bpy.context.active_object
rim.name = 'RimLight'
rim.data.energy       = 250
rim.data.spot_size    = math.radians(40)
rim.data.spot_blend   = 0.3
rim.rotation_euler    = (math.radians(130), 0, math.radians(15))
main_collection.objects.link(rim)

# ── 8. CAMERA ────────────────────────────────────────────────
bpy.ops.object.camera_add(
    location=(0.38, -0.55, 0.20),
    rotation=(math.radians(82), 0, math.radians(35)),
)
cam = bpy.context.active_object
cam.name = 'BottleCam'
cam.data.lens = 85          # portrait focal length
bpy.context.scene.camera = cam
main_collection.objects.link(cam)

# ── 9. RENDER SETTINGS (Cycles) ──────────────────────────────
scene = bpy.context.scene
scene.render.engine              = 'CYCLES'
scene.cycles.samples             = 128
scene.render.resolution_x        = 1080
scene.render.resolution_y        = 1920
scene.render.film_transparent    = True
scene.cycles.use_denoising       = True

# ── 10. ENSURE OBJECTS ARE SELECTABLE ────────────────────────
# This is crucial for export to work
for obj in bpy.data.objects:
    obj.select_set(False)

# Select all mesh objects
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

print(f"Bottle scene ready: {[o.name for o in bpy.data.objects if o.type == 'MESH']} selected for export")
