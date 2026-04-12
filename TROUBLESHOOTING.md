# BlenderLab Troubleshooting Guide

## Quick Fixes for Common Issues

### Issue 1: "No mesh objects created"

**Symptom:** Export fails with error message about no mesh objects

**Cause:** Your script didn't create any 3D mesh objects

**Solution:**
```python
import bpy

# ✅ CORRECT - Creates a mesh object
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
bpy.ops.object.shade_smooth()
```

**What NOT to do:**
```python
# ❌ WRONG - Only creates camera/light (not mesh objects)
bpy.ops.object.camera_add()
bpy.ops.object.light_add()
```

---

### Issue 2: Export parameters incompatible with Blender 5.0+

**Symptom:** Export fails with "unexpected keyword argument" error

**Cause:** Using deprecated Blender API parameters

**Solution:** The worker script has been updated to use Blender 5.0+ compatible parameters:
- GLB: `use_selection=False` (not `export_selected_only`)
- FBX: `use_selection=False` 
- STL: `use_selection=False`
- USD: `selected_objects_only=False`

You don't need to worry about this - the system handles it automatically!

---

### Issue 3: Script works locally but fails in BlenderLab

**Possible causes:**
1. **External dependencies** - Your script uses libraries not available in Blender
2. **File paths** - Hardcoded paths like `C:\Users\...` or `~/Desktop/...`
3. **Blender version differences** - Local Blender version differs from cloud (5.0+)

**Solution:**
```python
import bpy  # ✅ Always available

# ❌ AVOID - External libraries
# import numpy as np
# import PIL
# from scipy import ...

# ❌ AVOID - Hardcoded paths
# bpy.ops.import_scene.obj(filepath="C:/Users/me/model.obj")

# ✅ USE - Pure Blender Python API
bpy.ops.mesh.primitive_cube_add()
```

---

### Issue 4: Modifier not applying correctly

**Symptom:** Subdivision or other modifiers don't show in export

**Cause:** Modifier needs to be properly configured

**Solution:**
```python
import bpy

bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.active_object

# ✅ CORRECT - Create and configure modifier
modifier = cube.modifiers.new("Subdivision", 'SUBSURF')
modifier.levels = 2  # Viewport subdivisions
modifier.render_levels = 2  # Render subdivisions

bpy.ops.object.shade_smooth()
```

---

### Issue 5: Material not showing color

**Symptom:** Exported model is gray/white instead of colored

**Cause:** Material not properly assigned or nodes not configured

**Solution:**
```python
import bpy

bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.active_object

# Create material
mat = bpy.data.materials.new("MyMaterial")
mat.use_nodes = True  # ✅ Enable nodes

# Get the Principled BSDF node
bsdf = mat.node_tree.nodes['Principled BSDF']

# Set color (R, G, B, Alpha)
bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)
bsdf.inputs['Roughness'].default_value = 0.5

# ✅ IMPORTANT - Append material to object
cube.data.materials.append(mat)
```

---

### Issue 6: GitHub Actions not triggering

**Symptom:** Job stays in "queued" status forever

**Possible causes:**
1. Missing GitHub secrets in repository settings
2. Invalid GitHub token
3. Workflow file not in correct location

**Solution:**

1. **Check GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `FIREBASE_CONFIG` - Full Firebase service account JSON
   - `R2_BUCKET_NAME` - Your R2 bucket name
   - `R2_ACCESS_KEY` - R2 access key
   - `R2_SECRET_KEY` - R2 secret key
   - `CF_ACCOUNT_ID` - Cloudflare account ID
   - `R2_PUBLIC_URL` - Public URL for R2 bucket

2. **Check Vercel Environment Variables**:
   - `GITHUB_TOKEN` - Must have `repo` and `actions:read` permissions
   - `GITHUB_OWNER` - Your GitHub username
   - `GITHUB_REPO` - Repository name

3. **Verify workflow file exists**: `.github/workflows/main.yml`

---

### Issue 7: Files not downloading (404 error)

**Symptom:** Download links return 404 or access denied

**Cause:** R2 bucket not configured for public access

**Solution:**

1. **Check R2 bucket settings** in Cloudflare dashboard
2. **Verify R2_PUBLIC_URL** environment variable is set correctly
3. **Check bucket CORS settings** if accessing from web

---

### Issue 8: Export takes too long / times out

**Symptom:** Job fails with timeout error

**Cause:** Script creates too many polygons or complex geometry

**Solution:**
```python
import bpy

# ❌ TOO COMPLEX - Will timeout
for i in range(1000):
    bpy.ops.mesh.primitive_uv_sphere_add(subdivisions=128)

# ✅ OPTIMIZED - Reasonable complexity
for i in range(10):
    bpy.ops.mesh.primitive_uv_sphere_add(subdivisions=32)
    bpy.ops.object.shade_smooth()
```

**Tips:**
- Keep subdivision levels low (2-3 max)
- Limit number of objects (< 100)
- Use instancing for repeated objects
- Avoid high-poly primitives

---

## Testing Your Script Locally

Before submitting to BlenderLab, test in Blender:

1. **Open Blender** (version 5.0+ recommended)
2. **Go to Scripting tab**
3. **Create new script**
4. **Paste your code**
5. **Click Run (▶️)**
6. **Check 3D viewport** - Do objects appear?
7. **Try exporting** - File → Export → glTF 2.0 (.glb)

If it works locally, it should work in BlenderLab!

---

## Debug Checklist

When your export fails, check:

- [ ] Script creates at least one mesh object
- [ ] No external library imports (numpy, PIL, etc.)
- [ ] No hardcoded file paths
- [ ] Materials properly assigned with `use_nodes=True`
- [ ] Modifiers properly configured
- [ ] Smooth shading applied
- [ ] Script tested locally in Blender
- [ ] GitHub secrets configured (if using GitHub Actions)
- [ ] Vercel environment variables set

---

## Getting Help

1. **Check error message** in job status page
2. **Review ERROR_REFERENCE.md** for common errors
3. **Test locally** in Blender first
4. **Try example scripts** from `scripts/SAMPLES.py`
5. **Simplify your script** to isolate the issue

---

## Example: Complete Working Script

```python
import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

# Add subdivision modifier
modifier = cube.modifiers.new("Subdivision", 'SUBSURF')
modifier.levels = 2

# Apply smooth shading
bpy.ops.object.shade_smooth()

# Create and assign material
mat = bpy.data.materials.new("CubeMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)
bsdf.inputs['Roughness'].default_value = 0.5
cube.data.materials.append(mat)
```

This script is guaranteed to work! Use it as a starting point.

---

## Still Having Issues?

If you've tried everything and it still doesn't work:

1. Start with the minimal example above
2. Add your features one at a time
3. Test after each addition
4. This will help identify which part is causing the problem

Good luck! 🎨
