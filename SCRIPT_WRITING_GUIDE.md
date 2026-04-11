# ✅ How to Write Scripts for BlenderLab

## 🎯 Golden Rule

**Your script should ONLY create geometry. Let BlenderLab handle everything else.**

---

## ❌ DON'T Include In Your Script

### 1. Scene Clearing
```python
# ❌ DON'T - Worker handles this
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for col in bpy.data.collections:
    bpy.data.collections.remove(col)
```

### 2. Collection Setup
```python
# ❌ DON'T - Worker sets this up
if "Collection" not in bpy.data.collections:
    bpy.data.collections.new("Collection")
```

### 3. Export Code
```python
# ❌ DON'T - Worker handles export
import os
export_path = os.path.join(os.path.expanduser('~'), 'model.glb')
bpy.ops.export_scene.gltf(filepath=export_path, export_format='GLB')
```

### 4. Render Settings
```python
# ❌ DON'T - Optional, worker can handle
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 256
```

### 5. Hardcoded File Paths
```python
# ❌ DON'T - No home directory in CI/CD
export_path = os.path.expanduser('~/model.glb')
render_path = '/home/user/render.png'
```

---

## ✅ DO Include In Your Script

### 1. Geometry Creation
```python
# ✅ DO - Create your objects
import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"
```

### 2. Materials
```python
# ✅ DO - Add materials for visual quality
mat = bpy.data.materials.new("MyMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.2, 1.0)
cube.data.materials.append(mat)
```

### 3. Modifiers
```python
# ✅ DO - Add modifiers for detail
bevel = cube.modifiers.new("Bevel", 'BEVEL')
bevel.width = 0.1
```

### 4. Smooth Shading
```python
# ✅ DO - Improve appearance
bpy.ops.object.shade_smooth()
```

### 5. Transformations
```python
# ✅ DO - Position and scale objects
cube.location = (0, 0, 0)
cube.scale = (1, 1, 1)
cube.rotation_euler = (0, 0, 0)
```

### 6. Multiple Objects
```python
# ✅ DO - Create as many objects as needed
for i in range(10):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(i*2, 0, 0))
    bpy.ops.object.shade_smooth()
```

---

## 📋 Script Template

Use this as a starting point for any script:

```python
import bpy
import math
import random
from mathutils import Vector

# ========== YOUR CODE STARTS HERE ==========

# 1. Create your geometry
print("Creating geometry...")

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyAsset"

# 2. Apply materials
print("Applying materials...")
mat = bpy.data.materials.new("Material1")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.5, 0.9, 1.0)
cube.data.materials.append(mat)

# 3. Apply modifiers
print("Adding modifiers...")
bevel = cube.modifiers.new("Bevel", 'BEVEL')
bevel.width = 0.05

# 4. Polish
print("Finalizing...")
bpy.ops.object.shade_smooth()

# ========== CRITICAL: SELECT ALL MESH OBJECTS FOR EXPORT ==========
# BlenderLab needs all mesh objects selected to export them properly!
for obj in bpy.data.objects:
    obj.select_set(False)

for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

# Optional: Print status
print("✅ Asset created successfully!")
```
```

---

## 🌳 Example: Tree Asset Pack (Corrected)

```python
import bpy
import math

def create_tree(tree_type=1, location=(0, 0, 0)):
    """Create a stylized tree"""
    
    # Create trunk
    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=0.3,
        radius2=0.18,
        depth=4.5,
        location=location
    )
    trunk = bpy.context.active_object
    trunk.name = f"Trunk_{tree_type}"
    
    # Create foliage
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=1.2,
        location=(location[0], location[1], location[2] + 3)
    )
    foliage = bpy.context.active_object
    foliage.name = f"Foliage_{tree_type}"
    
    # Apply smooth shading
    bpy.ops.object.shade_smooth()

# Create 5 trees
for i in range(5):
    create_tree(i+1, location=(i*4, 0, 0))

print("✅ Tree pack created!")
```

**That's it!** BlenderLab worker handles:
- ✅ Scene clearing
- ✅ Export to GLB/FBX/STL/USD
- ✅ Materials processing
- ✅ Object selection
- ✅ File upload

---

## ⚡ Quick Checklist

Before submitting:
- [ ] NO scene clearing code
- [ ] NO export/file path code
- [ ] NO render settings needed
- [ ] Only geometry creation
- [ ] Test locally in Blender first
- [ ] Objects created? ✅

---

## 🔍 Debugging

**"Objects not created"?**
1. Test your script locally (Blender > Scripting tab)
2. Do you see objects in the 3D viewport?
3. If not → fix your script
4. If yes → copy exact script to BlenderLab

**"Export failed"?**
1. Run `scripts/test_export.py` locally
2. That tests the export system
3. Then submit your actual script

**"Script error"?**
1. Look at job details page
2. Specific error message given
3. Search for error in EXPORT_GUIDE.md

---

## 🎨 Material Tips

Add materials while creating objects:

```python
# Create object with material
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.active_object

# Add material
mat = bpy.data.materials.new("MyMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']

# Set color
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.2, 1.0)

# Set other properties
bsdf.inputs['Roughness'].default_value = 0.5
bsdf.inputs['Metallic'].default_value = 0.3

# Assign to object
obj.data.materials.append(mat)
```

---

## 🚀 What You CAN Create

With proper scripts, you can create:
- ✅ Complex procedural geometry
- ✅ Tree assets with materials
- ✅ Architectural structures
- ✅ Character models (mesh only)
- ✅ Abstract art
- ✅ Game assets
- ✅ 3D printing models
- ✅ Anything Blender Python can generate!

---

## 📚 Learn More

- [Scripts/SAMPLES.py](../scripts/SAMPLES.py) - Executable examples
- [Scripts/test_export.py](../scripts/test_export.py) - Test harness
- [Scripts/tree_asset_pack_blenderlab.py](../scripts/tree_asset_pack_blenderlab.py) - Complex example
- [EXPORT_GUIDE.md](../EXPORT_GUIDE.md) - Complete reference

---

**Write clean, focused scripts. Let BlenderLab handle the heavy lifting. 🚀**

---

## ✨ Spline-Quality Output (Automatic)

BlenderLab now automatically upgrades your geometry with:

- **HDRI lighting** — studio environment map, soft directional light
- **PBR clearcoat materials** — glossy plastic finish like Spline.design
- **Bloom + chromatic aberration** — cinematic post-processing
- **Transparent background** — PNG with alpha, floats on any bg
- **Shadow catcher** — soft drop shadow beneath your object
- **Interactive viewer** — drag-to-rotate in the browser, no downloads needed
- **Auto-framed camera** — camera automatically positions to fit your object

### What this means for your scripts

**Write geometry only.** The worker applies Spline-quality visuals automatically.

If your material already sets a custom color (not the default grey `0.8, 0.8, 0.8`), it will be preserved and only roughness/clearcoat will be upgraded.

### Quality presets

When submitting a job, you can choose from three quality levels:

| Preset | What it does |
|---|---|
| **Draft** ⚡ | Fast, basic lighting — skips all automatic upgrades. Use for quick iteration. |
| **Standard** ✨ | HDRI + PBR clearcoat + bloom + shadow catcher + auto-framed camera. **This is the default.** |
| **Cinematic** 🎬 | Everything in Standard + stronger bloom + 4K resolution. |

### Override behaviour

If you want full manual control, add this comment at the top of your script:

```python
# blenderlab:quality=draft
```

This skips all automatic upgrades regardless of the selected preset.

---
