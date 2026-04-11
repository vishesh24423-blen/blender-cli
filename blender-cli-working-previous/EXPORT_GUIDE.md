# BlenderLab Export Guide

## Overview
BlenderLab is a web-based service that runs Blender scripts on cloud resources and exports your 3D models in multiple formats. Simply write a Python script, select your output format, and we'll handle the rest!

## 🚀 What BlenderLab Handles For You

You focus on **geometry creation**. BlenderLab automatically handles:

- ✅ Clears default scene
- ✅ Sets up collections
- ✅ Selects all mesh objects
- ✅ Exports to GLB/FBX/STL/USD
- ✅ Uploads to cloud storage
- ✅ Provides 24-hour download links

**For detailed guidance, see [SCRIPT_WRITING_GUIDE.md](SCRIPT_WRITING_GUIDE.md)**

## Supported Export Formats

| Format | Best For | Notes |
|--------|----------|-------|
| **GLB** | Web, Game Engines | Recommended. glTF binary format, smallest file size |
| **FBX** | Animations, Rigging | Industry standard for 3D exchanges |
| **STL** | 3D Printing | Mesh-only format, ideal for manufacturing |
| **USD** | Large Scenes | Pixar's format, great for complex scenes |
| **OBJ** | ⚠️ Disabled | Currently broken in Blender 5.0+ snap version |

## Writing Blender Scripts

### Basic Requirements

Your script must:
1. **Create mesh objects** using `bpy.ops.*` functions or manual creation
2. **Link objects to a collection** so they can be found during export
3. **Avoid deleting everything** (if you clear the scene, create new objects!)
4. **Focus on geometry** (cameras and lights are ignored)

### Example: Simple Cube

```python
import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

# Smooth shading for better appearance
bpy.ops.object.shade_smooth()

# Add material
mat = bpy.data.materials.new("MyMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.5, 0.9, 1.0)
cube.data.materials.append(mat)
```

### Example: Array of Objects

```python
import bpy

# Create grid of spheres
for x in range(-3, 4):
    for y in range(-3, 4):
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.3,
            location=(x * 1.0, y * 1.0, 0)
        )
        sphere = bpy.context.active_object
        sphere.name = f"Sphere_{x}_{y}"
        bpy.ops.object.shade_smooth()
```

### Example: Custom Geometry from Vertices

```python
import bpy

# Define vertices (x, y, z coordinates)
verts = [
    (0, 0, 0),     # 0
    (1, 0, 0),     # 1
    (1, 1, 0),     # 2
    (0, 1, 0),     # 3
    (0.5, 0.5, 1), # 4
]

# Define faces (vertex indices for each face)
faces = [
    (0, 1, 4),   # triangle
    (1, 2, 4),   # triangle
    (2, 3, 4),   # triangle
    (3, 0, 4),   # triangle
    (0, 1, 2, 3),  # quad
]

# Create mesh and object
mesh = bpy.data.meshes.new("CustomMesh")
mesh.from_pydata(verts, [], faces)
mesh.update()

obj = bpy.data.objects.new("CustomObject", mesh)
bpy.context.collection.objects.link(obj)
bpy.ops.object.shade_smooth()
```

## Common Issues & Solutions

### ❌ "No valid exports created"

**Causes:**
- Script doesn't create any mesh objects
- All objects were deleted and not replaced
- Objects weren't linked to a collection
- Export command silently failed

**Diagnostic Steps:**

1. **Run the test script locally** (in Blender Scripting tab):
```python
# Copy and run this to verify export works
import bpy
bpy.ops.mesh.primitive_cube_add(size=2)
bpy.ops.object.shade_smooth()

# Try export manual
bpy.ops.export_scene.gltf(
    filepath='/tmp/test.glb',
    export_format='GLB'
)
print("✅ Export successful!")
```

2. **Check object creation:**
   - Switch to Scripting tab in Blender
   - Run your script
   - Look at the 3D viewport - do you see objects?
   - If not → objects weren't created
   - If yes → script works locally

3. **Verify object types:**
   - Only these types export: MESH, CURVE, SURFACE, GPENCIL, ARMATURE
   - Cameras and lights don't export
   - Empty objects don't export

4. **Check for script errors:**
   - Look for typos in variable names
   - Check that functions exist (e.g., `bpy.ops.mesh.primitive_cube_add`)
   - Test with simpler script first

**Solutions:**

1. **Start with the test script:**
   - Copy `scripts/test_export.py` from BlenderLab repo
   - Upload it - if it exports successfully, your system works
   
2. **Simplify your script:**
   ```python
   import bpy
   # Most basic: just create one cube
   bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
   bpy.ops.object.shade_smooth()
   ```

3. **Check for syntax errors:**
   - Test locally first (Blender > Scripting tab)
   - Press ▶ Run Script
   - Check if objects appear in viewport

4. **Verify object is created:**
   ```python
   import bpy
   bpy.ops.mesh.primitive_cube_add()  # Create something
   cube = bpy.context.active_object
   print(f"Created: {cube.name} (type: {cube.type})")
   # Should print: Created: Cube (type: MESH)
   ```

5. **Use provided samples:**
   - Try `scripts/SAMPLES.py` templates first
   - Compare your script with working examples
   - Match variable naming and structure

### ❌ "No objects in scene to export"

**Causes:**
- Script deleted all objects but didn't create new ones
- Objects exist but aren't linked to a collection
- Objects were created but then deleted

**Solutions:**
```python
# ❌ WRONG - deletes everything without replacement
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ✅ CORRECT - delete then create
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

bpy.ops.mesh.primitive_cube_add()  # Create something new!
```

### ❌ Export takes too long or times out

**Causes:**
- Too many vertices/faces (7+ million)
- Very complex modifiers or simulations

**Solutions:**
- Optimize geometry: use lower subdivision levels
- Reduce particle counts
- Bake simulations where possible
- Test locally first to see render times

### ❌ File is too small / seems corrupted

**Causes:**
- Export succeeded but file is empty/minimal
- Blender had a bug during export

**Solutions:**
1. Try a different format (GLB, FBX, STL)
2. Simplify your script and try again
3. Check the Blender console output for errors

## Best Practices

### 1. Use Proper Object Creation
```python
# ✅ Good - uses standard Blender operators
bpy.ops.mesh.primitive_cube_add()

# ✅ Also good - manual creation
mesh = bpy.data.meshes.new("Mesh")
obj = bpy.data.objects.new("Object", mesh)
bpy.context.collection.objects.link(obj)  # Don't forget!
```

### 2. Always Link Objects to Collections
```python
# ✅ Correct - objects are linked
bpy.ops.mesh.primitive_cube_add()  # Automatically linked
obj = bpy.data.objects.new("Obj", mesh)
bpy.context.collection.objects.link(obj)  # Explicit link

# ❌ Wrong - object not linked = invisible to export
obj = bpy.data.objects.new("Obj", mesh)
# Missing: bpy.context.collection.objects.link(obj)
```

### 3. Apply Smooth Shading
```python
# Get object
obj = bpy.context.active_object
# Apply smooth shading
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.shade_smooth()
```

### 4. Test Locally First
Before submitting to BlenderLab:
1. Open Blender
2. Go to Scripting tab
3. Paste your script
4. Press ▶ Run Script
5. Check if objects appear correctly
6. Try exporting manually (File > Export)

### 5. Optimize for Performance
```python
import bpy

# ✅ Efficient - moderate geometry
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=32, ring_count=16)

# ❌ Slow - too many vertices
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=256, ring_count=128)
```

## Advanced: Working with Collections

```python
import bpy

# Create a new collection
my_collection = bpy.data.collections.new("GroupName")
bpy.context.scene.collection.children.link(my_collection)

# Create object and link to specific collection
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.active_object
my_collection.objects.link(obj)  # Link to specific collection
```

## Decoding Error Messages

When your job fails, the error message contains diagnostic information. Here's how to read it:

### Example 1: "No exportable objects in scene"
```
glb: No mesh objects created by script | No objects selected for export
```
**Meaning:** Your script either didn't create objects or they weren't selectable
**Fix:** Add `bpy.ops.mesh.primitive_cube_add()` to your script

### Example 2: "Script crashed - check syntax"
```
glb: Script crashed - check syntax
```
**Meaning:** Your Python code has an error
**Fix:** Test locally in Blender Scripting tab first

### Example 3: "File too small"
```
glb: File too small (245 bytes)
```
**Meaning:** Export created a file but it's too small to be valid
**Fix:** Try different export format or simplify script

### Example 4: "Export command failed"
```
glb: Export command failed
```
**Meaning:** The Blender export command hit an issue
**Fix:** Try different format or test locally first

## Using the Test Script

BlenderLab includes a diagnostic test script:

**Local testing (before submitting):**
1. Download: `scripts/test_export.py` from BlenderLab
2. Open Blender
3. Scripting tab > New
4. Paste contents of test_export.py
5. Run ▶
6. Check if all tests pass ✅

This tests:
- Scene clearing
- Object creation
- Material application
- Object selection
- GLB export

If the test script works, your system is ready for exporting!

---

**Troubleshooting Flow:**

```
Export failed?
  ↓
Check error message
  ↓
Try test script locally (scripts/test_export.py)
  ↓
Does test script work?
  ├─ YES → Your system works. Simplify your script.
  └─ NO → Blender/export issue. Reinstall or update Blender.
  ↓
Try simpler version of your script
  ↓
Check sample scripts (scripts/SAMPLES.py)
  ↓
Compare with working example
  ↓
Success! ✨
```

---

**Happy exporting!** For more examples, see [scripts/SAMPLES.py](scripts/SAMPLES.py) and [scripts/test_export.py](scripts/test_export.py).
## Getting Help

If your export fails:
1. Check the error message on the job page
2. Look for clues in your script
3. Test the script locally in Blender
4. Try the sample scripts first
5. Simplify your script piece by piece

## Server Details

- **Engine:** Blender 5.0+ (snap version)
- **Timeout:** 5 minutes per export
- **File Retention:** 24 hours
- **Concurrent Exports:** Limited by runner availability

## Troubleshooting Script Issues

### Issue: Import errors

```python
# ❌ This won't work - module not available
import numpy
import PIL

# ✅ Only use Blender built-ins
import bpy
import bmesh
import mathutils
```

### Issue: Script crashes

```python
# ✅ Always use try/except for debugging
try:
    # Your code here
    bpy.ops.mesh.primitive_cube_add()
except Exception as e:
    print(f"Error: {e}")
```

### Issue: Modified geometry not exporting

```python
import bpy
import bmesh

# ✅ Always update mesh after BMesh operations
mesh = bpy.context.active_object.data
bm = bmesh.new()
bm.from_mesh(mesh)

# ... make changes ...

bm.to_mesh(mesh)
mesh.update()  # ← Important!
bm.free()
```

---

**Happy rendering!** For more Blender Python documentation, visit: https://docs.blender.org/api/current/
