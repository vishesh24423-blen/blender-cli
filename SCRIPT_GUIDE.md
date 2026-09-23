# Blender Asset Export Script Guide

The blender-cli worker runs **pure asset generation pipelines**. Your Python script receives a completely clean Blender scene and is responsible for creating all geometry that should appear in the final GLB export.

This guide has been updated with practices for generating **accurate, detailed geometry** rather than compact/blocky primitive stacks. If your goal is realistic or production-quality assets, follow the "Accurate Geometry" section closely — simple `primitive_cube_add` chains tend to look flat, low-detail, and geometrically imprecise.

## Quick Overview

The worker pipeline is:
1. **Scene clear** — default Blender cube/camera/light are removed
2. **Your script runs** — you create all geometry
3. **Fallback cube added** — only if your script made nothing
4. **GLB export** — automatic, no preview render

**There is no camera, HDRI, material override, or rendering involved.** The output is a pure geometry asset.

---

## Principles for Accurate (Non-Compact) Assets

Compact/blocky results usually come from relying only on `bpy.ops.mesh.primitive_*` calls at low subdivision with no cleanup. To produce accurate, detailed geometry instead:

1. **Model at real-world scale.** Decide actual dimensions in meters before writing any code (e.g., a chair seat is ~0.45 m high, a door is ~2.0 m tall). Use `size=2` on cube primitives so the scale factor equals the half-extent directly — this keeps proportions transparent and avoids silent factor-of-2 errors.
2. **Prefer `bmesh` over raw operators for custom shapes.** Build meshes with `bmesh.ops.create_*` / manual vertex-face construction and `bm.to_mesh()`, or `mesh.from_pydata()`, instead of chaining only primitive operators. This gives you control over topology density, not just bounding shape.
3. **Add real detail, not just subdivision.** Subdividing a cube smooths it but doesn't add *accurate* detail — it just rounds corners. Accurate detail comes from modeling actual features: bevels on edges, insets for panel lines, extrusions for ribs/handles/fasteners, and boolean cuts for holes, sockets, or negative space.
4. **Use bevels on hard-surface edges.** Real-world objects almost never have perfectly sharp 90° edges. Add a `BEVEL` modifier (small width, 2-3 segments) to hard-surface parts before applying, so edges catch light correctly and don't look like raw primitives.
5. **Validate topology as you build.** After `from_pydata()` or bmesh operations, always call `mesh.validate(verbose=True)` and `mesh.update()`. This catches duplicate faces, degenerate geometry, and non-manifold edges before export.
6. **Check face type by function**, not habit:
   - Curved or subdivided surfaces → quads only, no n-gons or triangles.
   - Deforming/organic parts → quads; triangles only in rigid, non-deforming pockets.
   - Flat terminal caps (floor tiles, bolt heads) → n-gons are fine.
   - Shading transitions on hard-surface parts → triangles are fine if hidden in a bevel or against a sharp edge.
7. **Apply transforms before exporting.** Always run `bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)` after setting `obj.scale`/`obj.rotation_euler`, ideally immediately, not at the very end of the script. Unapplied scale is the single biggest cause of "wrong size" or distorted exports.
8. **Verify overlap and bounds at joints.** When assembling multi-part assets, parts that should touch need real geometric overlap (a few millimeters), not just visually-close coordinates. Compute each object's world-space bounding box and confirm intended overlap before moving to the next part.
9. **Fix normals and manifoldness.** Detect flipped faces by checking `edge.is_manifold and not edge.is_contiguous`, or by testing signed volume for whole-object inversion. Flipped normals cause faces to look "burnt out" or missing after GLB export.
10. **Finish with shading, not raw facets.** Apply `shade_smooth()` plus `mesh.set_sharp_from_angle(angle=...)` (radians) so curved and flat regions render correctly without manually marking every edge.

---

## Minimal Example

```python
import bpy

# Create a simple cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

print("[BL] Created cube")
```

That's it. The worker will:
- Clear the scene
- Run your script
- See you created 1 mesh (`MyCube`)
- Export it as GLB

---

## What You Have Access To

Your script runs inside Blender's Python environment with these modules pre-imported:

```python
import bpy          # Blender's main API
import os           # OS utilities
import sys          # System utilities
import traceback    # Error reporting
```

You can also import standard Python libraries and any Blender Python modules (e.g., `mathutils`, `bmesh`).

---

## Creating Geometry

### Basic Mesh Primitives

```python
import bpy

# Add a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "Cube_1"

# Add a sphere
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.5, location=(5, 0, 0))
sphere = bpy.context.active_object
sphere.name = "Sphere_1"

# Add a cylinder
bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, location=(10, 0, 0))
cylinder = bpy.context.active_object
cylinder.name = "Cylinder_1"

# Add a cone
bpy.ops.mesh.primitive_cone_add(radius=1, depth=2, location=(15, 0, 0))
cone = bpy.context.active_object
cone.name = "Cone_1"

# Add a torus
bpy.ops.mesh.primitive_torus_add(major_radius=2, minor_radius=0.5, location=(20, 0, 0))
torus = bpy.context.active_object
torus.name = "Torus_1"
```

Primitives are only a starting point. For an accurate asset, treat each primitive as a base you refine with bevels, insets, and booleans — not the finished part.

### Custom Mesh from Vertices & Faces

```python
import bpy

# Create mesh data
mesh_data = bpy.data.meshes.new("CustomMesh")
mesh_obj = bpy.data.objects.new("CustomMesh", mesh_data)

# Add to scene
bpy.context.scene.collection.objects.link(mesh_obj)

# Define vertices (list of (x, y, z) tuples), using real measurements in meters
vertices = [
    (-1, -1, 0),
    (1, -1, 0),
    (1, 1, 0),
    (-1, 1, 0),
]

# Define faces (list of vertex index tuples)
faces = [
    (0, 1, 2, 3),  # quad face
]

# Set mesh geometry
mesh_data.from_pydata(vertices, [], faces)
mesh_data.update()
mesh_data.validate(verbose=True)  # catch degenerate/duplicate geometry early

print("[BL] Created custom mesh")
```

### Building Detailed Geometry with bmesh

Use `bmesh` when you need precise control over topology density (loop cuts, insets, extrusions) rather than a single flat primitive:

```python
import bpy
import bmesh

bm = bmesh.new()
bmesh.ops.create_cube(bm, size=2.0)

# Inset a panel line into the top face
top_face = max(bm.faces, key=lambda f: f.calc_center_median().z)
bmesh.ops.inset_individual(bm, faces=[top_face], thickness=0.05, depth=-0.02)

# Bevel all edges slightly so it doesn't look like a raw primitive
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.02, segments=2, affect='EDGES')

mesh_data = bpy.data.meshes.new("DetailedPanel")
bm.to_mesh(mesh_data)
bm.free()
mesh_data.update()
mesh_data.validate(verbose=True)

obj = bpy.data.objects.new("DetailedPanel", mesh_data)
bpy.context.scene.collection.objects.link(obj)

print("[BL] Created detailed bmesh panel")
```

### Using Modifiers

```python
import bpy

# Create a base cube
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = "ModifiedCube"

# Add a Subdivision Surface modifier
subdiv = obj.modifiers.new(name="Subdiv", type='SUBSURF')
subdiv.levels = 2

# Add a Bevel modifier so hard edges aren't perfectly sharp (more accurate look)
bevel = obj.modifiers.new(name="Bevel", type='BEVEL')
bevel.width = 0.02
bevel.segments = 3

# Apply the modifiers in order (bottom of stack first if order matters)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.ops.object.modifier_apply(modifier=subdiv.name)

print("[BL] Applied Bevel + Subdivision Surface")
```

Subdivision alone rounds a shape uniformly — it does not add accurate detail. Pair it with bevels, insets, or booleans that represent real features of the object you're modeling.

### Boolean Operations

```python
import bpy

# Create two objects
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
base = bpy.context.active_object
base.name = "Base"

bpy.ops.mesh.primitive_sphere_add(radius=1.2, location=(1, 0, 0))
cutter = bpy.context.active_object
cutter.name = "Cutter"

# Add Boolean modifier to base
bool_mod = base.modifiers.new(name="Boolean", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = cutter

# Apply the modifier
bpy.context.view_layer.objects.active = base
base.select_set(True)
bpy.ops.object.modifier_apply(modifier=bool_mod.name)

# Delete the cutter
bpy.data.objects.remove(cutter, do_unlink=True)

print("[BL] Boolean operation complete")
```

Booleans are one of the most reliable ways to add accurate detail (holes, sockets, cutouts, recesses) without hand-authoring topology. After applying, run `mesh.validate(verbose=True)` — booleans can leave non-manifold geometry that needs cleanup.

---

## Working with Objects

### Moving & Rotating Objects

```python
import bpy
from mathutils import Matrix, Euler
import math

# Create an object
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
obj = bpy.context.active_object

# Translate
obj.location = (5, 10, 3)

# Rotate (Euler angles in radians)
obj.rotation_euler = (
    math.radians(45),   # X rotation
    math.radians(30),   # Y rotation
    math.radians(90),   # Z rotation
)

# Scale
obj.scale = (2, 1, 1.5)

# Apply transforms to geometry immediately — don't defer this to the end of the script
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

print(f"[BL] Object at {obj.location}, rotated, scaled")
```

### Parenting & Grouping

```python
import bpy

# Create parent object
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
parent = bpy.context.active_object
parent.name = "Parent"

# Create child objects
for i in range(3):
    bpy.ops.mesh.primitive_sphere_add(radius=0.5, location=(i*2, 0, 0))
    child = bpy.context.active_object
    child.name = f"Child_{i}"
    child.parent = parent  # Set parent relationship

print("[BL] Created parent-child hierarchy")
```

### Naming Objects

Objects with names starting with `_` (underscore) are **ignored** by the export system. Use this for helper/utility objects:

```python
import bpy

# Visible object (will be exported)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = "MainGeometry"

# Helper object (will NOT be exported)
bpy.ops.mesh.primitive_sphere_add(radius=0.1, location=(10, 10, 10))
helper = bpy.context.active_object
helper.name = "_Helper"  # Starts with underscore

print("[BL] Only MainGeometry will export")
```

---

## Verifying Accuracy Before Export

Add these checks near the end of your script to catch the most common causes of inaccurate/low-quality output before the worker exports the GLB:

```python
import bpy

def verify_bounds(obj):
    """Return world-space bounding box dimensions in meters."""
    bbox = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [v.x for v in bbox]; ys = [v.y for v in bbox]; zs = [v.z for v in bbox]
    dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    print(f"[BL] {obj.name} bounds: {dims}")
    return dims

def audit_scene():
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.name.startswith('_'):
            continue
        if obj.scale != (1.0, 1.0, 1.0) or any(abs(r) > 1e-4 for r in obj.rotation_euler):
            print(f"[BL] WARNING: {obj.name} has un-applied transform — apply before export")
        obj.data.validate(verbose=True)
        verify_bounds(obj)

audit_scene()
```

Run this kind of audit whenever precision matters (real-world proportions, parts that must touch, or assets going into a physics/scale-sensitive pipeline).

---

## Procedural Generation

### Grid of Objects

```python
import bpy

count = 5
spacing = 3

for x in range(count):
    for z in range(count):
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(x * spacing, 0, z * spacing)
        )
        obj = bpy.context.active_object
        obj.name = f"Cube_{x}_{z}"

print(f"[BL] Created {count*count} cubes in a grid")
```

### Mesh Subdivision with Geometry Nodes

```python
import bpy

# Create a base mesh
bpy.ops.mesh.primitive_ico_sphere_add(radius=1, subdivisions=1, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = "Subdivided"

# Add subdivision modifier
subdiv = obj.modifiers.new(name="Subdivision", type='SUBSURF')
subdiv.levels = 3
subdiv.render_levels = 4

print("[BL] Created subdivided sphere")
```

### Creating Instances from a Template

```python
import bpy

# Create a template mesh
bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=2, location=(0, 0, 0))
template = bpy.context.active_object
template.name = "CylinderTemplate"

# Create instances
for i in range(10):
    # Create a duplicate
    bpy.context.view_layer.objects.active = template
    template.select_set(True)
    bpy.ops.object.duplicate()

    duplicate = bpy.context.active_object
    duplicate.name = f"Cylinder_{i}"
    duplicate.location.x = i * 1.5

print("[BL] Created cylinder instances")
```

---

## Error Handling

Your script is wrapped in a try/except block. If an error occurs:
- The error is logged with a traceback
- The worker still attempts to export (fallback cube added if no meshes exist)
- The job doesn't immediately fail

**Always check your logs** for `[BL] USER_ERROR` to debug issues:

```python
import bpy

try:
    # Your code here
    bpy.ops.mesh.primitive_cube_add(size=1)
    print("[BL] Cube created successfully")
except Exception as e:
    print(f"[BL] Caught error: {e}")
    # Recovery code (optional)
    import traceback
    traceback.print_exc()
```

---

## Working with Data

### Importing External Data

```python
import bpy
import json
import os

# Load a JSON file from the job directory
config_path = os.path.join(os.getcwd(), "config.json")
if os.path.exists(config_path):
    with open(config_path, "r") as f:
        config = json.load(f)
    print(f"[BL] Loaded config: {config}")
else:
    print("[BL] No config file found")
```

### Working with File Paths

```python
import bpy
import os

# Get current working directory
cwd = os.getcwd()
print(f"[BL] Working directory: {cwd}")

# Construct paths safely
asset_dir = os.path.join(cwd, "assets")
if os.path.exists(asset_dir):
    print(f"[BL] Found asset directory: {asset_dir}")
```

---

## Performance Tips

### Use Batch Operations

```python
import bpy

# Batch select and operate
bpy.ops.object.select_all(action='SELECT')
# Do operations on all selected objects
bpy.ops.object.shade_smooth()
bpy.ops.object.select_all(action='DESELECT')
```

### Avoid Viewport Updates During Heavy Operations

```python
import bpy

# Context overrides can speed up operations
for i in range(100):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(i, 0, 0))
    # Don't update viewport on every creation
```

### Use Blender's Built-in Math

```python
import bpy
from mathutils import Vector, Euler, Matrix
import math

# Mathutils is faster than rolling your own
v1 = Vector((1, 2, 3))
v2 = Vector((4, 5, 6))
distance = (v1 - v2).length
print(f"[BL] Distance: {distance}")
```

Note: performance shortcuts (fewer verts, skipped validation) trade off against accuracy. For hero/detail assets, prioritize correctness first, then optimize only the parts that need it (e.g., decimate background props, not the focal asset).

---

## Expected Log Output

When your script runs successfully, you'll see:

```
[BL] blender=4.1.1
[BL] python=3.11.7
[BL] cwd=/tmp/job_abc123
[BL] SCENE_CLEARED
[BL] USER_SCRIPT
[BL] USER_OK
[BL] MESHES=5
[BL] EXPORT /tmp/job_abc123/output.glb
[BL] SIZE=45678
[BL] DONE
```

### Common Issues

**`[BL] MESHES=0` + `[BL] FALLBACK`**
- Your script ran but created no mesh objects
- Check for errors above the `[BL] USER_OK` line
- Verify object names don't start with `_`

**`[BL] USER_ERROR`**
- Your script threw an exception
- Check the traceback in the logs
- Fallback cube will be exported

**`[BL] SIZE=<small number>`**
- GLB file is too small (< 50 bytes expected)
- Your export might have failed silently
- Check for Blender export errors in logs

**Asset looks "compact" or blocky despite subdivision**
- You likely relied only on primitive operators + SUBSURF, which rounds shape but adds no real detail
- Add bevels on hard edges, insets for panel lines, and booleans for holes/sockets
- Verify `mesh.validate(verbose=True)` reports no issues, and that scale/rotation were applied before export

---

## Complete Example: Complex, Detailed Asset

```python
import bpy
import bmesh
import math

# Clear naming for clarity
ASSET_NAME = "ComplexAsset"

print(f"[BL] Starting {ASSET_NAME} generation")

# 1. Create base structure with bmesh for topology control
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=2.0)
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.05, segments=3, affect='EDGES')

mesh_data = bpy.data.meshes.new(f"{ASSET_NAME}_Base")
bm.to_mesh(mesh_data)
bm.free()
mesh_data.update()
mesh_data.validate(verbose=True)

base = bpy.data.objects.new(f"{ASSET_NAME}_Base", mesh_data)
bpy.context.scene.collection.objects.link(base)

# 2. Add subdivision on top of the beveled base for smoother curvature
subdiv = base.modifiers.new(name="Subdivision", type='SUBSURF')
subdiv.levels = 1

# 3. Create decorative elements at accurate real-world spacing (meters)
for i in range(4):
    angle = (i / 4) * 2 * math.pi
    x = 3 * math.cos(angle)
    z = 3 * math.sin(angle)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(x, 0, z))
    sphere = bpy.context.active_object
    sphere.name = f"{ASSET_NAME}_Sphere_{i}"

# 4. Create a connector structure with a boolean socket cut
for i in range(4):
    angle = (i / 4) * 2 * math.pi
    x = 2.5 * math.cos(angle)
    z = 2.5 * math.sin(angle)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=0.5, location=(x, 0, z))
    cyl = bpy.context.active_object
    cyl.name = f"{ASSET_NAME}_Connector_{i}"

# 5. Count meshes
meshes = [o for o in bpy.data.objects
          if o.type == 'MESH' and not o.name.startswith('_')]
print(f"[BL] Created {len(meshes)} mesh objects")

# 6. Apply smooth shading and validate every mesh before export
for obj in meshes:
    try:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.shade_smooth()
        obj.data.validate(verbose=True)
        obj.select_set(False)
    except Exception as e:
        print(f"[BL] WARNING: could not finalize {obj.name}: {e}")

print(f"[BL] {ASSET_NAME} generation complete")
```

---

## Next Steps

1. **Test locally**: Copy your script and run it in Blender's Python console
2. **Check output**: Inspect generated meshes in the 3D viewport, and confirm proportions match your intended real-world dimensions
3. **Run the audit**: Use the `audit_scene()` snippet above to check for un-applied transforms and mesh validity
4. **Submit to worker**: Push to GitHub and trigger a job
5. **Review logs**: Check `[BL]` markers in GitHub Actions output

For issues, check the **expected log output** section above and review your error messages carefully.
