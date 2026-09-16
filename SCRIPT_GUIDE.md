# Blender Asset Export Script Guide

The blender-cli worker runs **pure asset generation pipelines**. Your Python script receives a completely clean Blender scene and is responsible for creating all geometry that should appear in the final GLB export.

## Quick Overview

The worker pipeline is:
1. **Scene clear** — default Blender cube/camera/light are removed
2. **Your script runs** — you create all geometry
3. **Fallback cube added** — only if your script made nothing
4. **GLB export** — automatic, no preview render

**There is no camera, HDRI, material override, or rendering involved.** The output is a pure geometry asset.

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

You can also import standard Python libraries and any Blender Python modules (e.g., `mathutils`).

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

### Custom Mesh from Vertices & Faces

```python
import bpy

# Create mesh data
mesh_data = bpy.data.meshes.new("CustomMesh")
mesh_obj = bpy.data.objects.new("CustomMesh", mesh_data)

# Add to scene
bpy.context.scene.collection.objects.link(mesh_obj)

# Define vertices (list of (x, y, z) tuples)
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

print("[BL] Created custom mesh")
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

# Apply the modifier
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.modifier_apply(modifier=subdiv.name)

print("[BL] Applied Subdivision Surface")
```

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

# Apply transforms to geometry
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

---

## Complete Example: Complex Asset

```python
import bpy
import math
from mathutils import Vector

# Clear naming for clarity
ASSET_NAME = "ComplexAsset"

print(f"[BL] Starting {ASSET_NAME} generation")

# 1. Create base structure
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
base = bpy.context.active_object
base.name = f"{ASSET_NAME}_Base"

# 2. Add detail with modifiers
subdiv = base.modifiers.new(name="Subdivision", type='SUBSURF')
subdiv.levels = 2

# 3. Create decorative elements
for i in range(4):
    angle = (i / 4) * 2 * math.pi
    x = 3 * math.cos(angle)
    z = 3 * math.sin(angle)
    
    bpy.ops.mesh.primitive_sphere_add(
        radius=0.5,
        location=(x, 0, z)
    )
    sphere = bpy.context.active_object
    sphere.name = f"{ASSET_NAME}_Sphere_{i}"
    
    # Add smooth shading
    sphere.data.use_auto_smooth = True

# 4. Create a connector structure
for i in range(4):
    angle = (i / 4) * 2 * math.pi
    x = 2.5 * math.cos(angle)
    z = 2.5 * math.sin(angle)
    
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.1,
        depth=0.5,
        location=(x, 0, z)
    )
    cyl = bpy.context.active_object
    cyl.name = f"{ASSET_NAME}_Connector_{i}"

# 5. Count meshes
meshes = [o for o in bpy.data.objects 
          if o.type == 'MESH' and not o.name.startswith('_')]
print(f"[BL] Created {len(meshes)} mesh objects")

# 6. Apply smooth shading to everything
for obj in meshes:
    if obj.type == 'MESH':
        try:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)
        except:
            pass

print(f"[BL] {ASSET_NAME} generation complete")
```

---

## Next Steps

1. **Test locally**: Copy your script and run it in Blender's Python console
2. **Check output**: Inspect generated meshes in the 3D viewport
3. **Submit to worker**: Push to GitHub and trigger a job
4. **Review logs**: Check `[BL]` markers in GitHub Actions output

For issues, check the **expected log output** section above and review your error messages carefully.
