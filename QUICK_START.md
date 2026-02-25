# Quick Start Guide - BlenderLab 3D Asset Creation

## 🎯 In 60 Seconds

### Step 1: Write Your Script
```python
import bpy

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

# Create your object
bpy.ops.mesh.primitive_cube_add(size=2)
obj = bpy.context.active_object
obj.name = "MyAsset"

# Polish it
bpy.ops.object.shade_smooth()
```

### Step 2: Select Format(s)
- **GLB** ← Recommended (web-friendly, smallest)
- FBX (game engines, professional)
- STL (3D printing)
- USD (complex scenes)

### Step 3: Submit
Click "Submit" and watch the magic happen! 🎨

---

## ✅ What Makes a Good Script

### Must-Have
✓ Creates at least one mesh object
✓ Objects linked to collection (automatic with `bpy.ops.*`)
✓ Uses built-in Blender operations

### Nice-to-Have
✓ Smooth shading for better appearance
✓ Materials for color/texture
✓ Comments explaining the code
✓ Tested locally in Blender first

### Must-Avoid
✗ Deleting all objects without replacing them
✗ Using packages outside Blender (numpy, PIL, etc.)
✗ Hardcoded file paths (~/Desktop, C:\, etc.)
✗ Very high poly counts (>7M vertices)
✗ Long-running simulations or renders

---

## 🔨 Common Templates

### 1. Parametric Object
```python
import bpy

def create_gear(teeth=20, outer_radius=0.5):
    # Create logic here
    pass

gear = create_gear(teeth=24, outer_radius=1.0)
```

### 2. Procedural Array
```python
import bpy
import random

random.seed(42)  # For reproducible results

for i in range(10):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.3,
        location=(i * 1.2, random.uniform(-0.5, 0.5), 0)
    )
    bpy.ops.object.shade_smooth()
```

### 3. Custom Geometry
```python
import bpy

vertices = [(0,0,0), (1,0,0), (1,1,0), (0,1,0), (0.5,0.5,1)]
faces = [(0,1,4), (1,2,4), (2,3,4), (3,0,4), (0,1,2,3)]

mesh = bpy.data.meshes.new("Custom")
mesh.from_pydata(vertices, [], faces)
mesh.update()

obj = bpy.data.objects.new("Pyramid", mesh)
bpy.context.collection.objects.link(obj)
bpy.ops.object.shade_smooth()
```

### 4. Modifier-Based
```python
import bpy

bpy.ops.mesh.primitive_plane_add(size=2)
obj = bpy.context.active_object

# Add subdivisions
subsurf = obj.modifiers.new("Subdivision", 'SUBSURF')
subsurf.levels = 3
subsurf.render_levels = 4

# Add wave effect
wave = obj.modifiers.new("Wave", 'WAVE')
wave.strength = 0.5
```

---

## 🐛 Debugging Failures

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| "No objects to export" | Script didn't create objects | Add object creation code |
| "File too small" | Export format issue | Try different format |
| "Script error" | Python syntax error | Use valid Python syntax |
| "Timeout" | Script takes >5 min | Optimize geometry/modifiers |

### Debug Locally:
1. Copy your script to Blender (Scripting tab)
2. Press ▶️ Run Script
3. Check if objects appear
4. Manually export (File > Export) to test

---

## 📦 Size Reference

- **Small asset:** 10KB - 100KB (simple cube, sphere)
- **Medium asset:** 100KB - 1MB (detailed mesh, textures)
- **Large asset:** 1MB - 10MB (complex scene, high poly)
- **Too large:** >100MB (will fail and be rejected)

All files expire in **24 hours** after export.

---

## 🎨 Material Tips

### Basic Color
```python
import bpy

bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.active_object

mat = bpy.data.materials.new("Basic")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.3, 1.0)  # Green
bsdf.inputs['Roughness'].default_value = 0.3

obj.data.materials.append(mat)
```

### Metallic
```python
bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1.0)
bsdf.inputs['Metallic'].default_value = 1.0
bsdf.inputs['Roughness'].default_value = 0.1
```

### Glass
```python
bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
bsdf.inputs['IOR'].default_value = 1.45
# For Blender 4.x:
if 'Transmission Weight' in bsdf.inputs:
    bsdf.inputs['Transmission Weight'].default_value = 1.0
# For Blender 3.x:
elif 'Transmission' in bsdf.inputs:
    bsdf.inputs['Transmission'].default_value = 1.0
```

---

## 🚀 Advanced: Collections

```python
import bpy

# Create named group
col = bpy.data.collections.new("MyGroup")
bpy.context.scene.collection.children.link(col)

# Add objects to it
bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.active_object
col.objects.link(cube)  # Add to collection
bpy.context.scene.collection.objects.unlink(cube)  # Remove from root
```

---

## 📚 Resources

- **Blender Python API:** https://docs.blender.org/api/
- **BlenderLab Guide:** See `EXPORT_GUIDE.md` in repo
- **Sample Scripts:** See `scripts/SAMPLES.py` in repo

---

## ⚡ Pro Tips

1. **Version Control:** Keep a copy of working scripts
2. **Incremental Testing:** Build script step-by-step, test after each part
3. **Performance:** Use low poly first, increase after testing succeeds
4. **Seeds:** Use `random.seed()` for reproducible randomness
5. **Comments:** Future you will thank present you!

---

## Getting Help

If your export fails:
1. Read the error message carefully
2. Check `EXPORT_GUIDE.md` troubleshooting section
3. Test your script locally in Blender
4. Start with a simple shape and build up
5. Compare with examples in `scripts/SAMPLES.py`

---

**Ready? Let's create! 🎨**
