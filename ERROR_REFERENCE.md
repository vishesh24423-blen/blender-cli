# 🚨 BlenderLab Export Error Reference Card

Quick reference for diagnosing and fixing export failures.

---

## Error: "No exportable objects in scene"

**Meaning:** Your script didn't create any mesh objects

**Check:**
1. Did you use `bpy.ops.mesh.primitive_*` functions?
2. Do objects appear in Blender viewport when you test locally?

**Fix - Minimal Test:**
```python
import bpy
bpy.ops.mesh.primitive_cube_add(size=2)
bpy.ops.object.shade_smooth()
```

**Common Cause:** Script creates non-mesh objects (cameras, lights, empties)

---

## Error: "Script crashed - check syntax"

**Meaning:** Your Python code has errors

**Check:**
1. Look for typos in function names
2. Check variable names are correct
3. Verify parameter names are correct

**Fix - Test Locally First:**
1. Open Blender
2. Scripting tab > New
3. Paste your exact script
4. Press ▶
5. Check for red text errors

**Common Cause:**
```python
# ❌ Wrong - typo in function name
bpy.ops.mesh.primiive_cube_add()  # typo: primiive

# ✅ Correct
bpy.ops.mesh.primitive_cube_add()
```

---

## Error: "File too small (245 bytes)"

**Meaning:** Export created a file but it's too small/empty

**Check:**
1. Try a different format (GLB → FBX)
2. Simplify your script
3. Reduce modifier complexity

**Fix:**
```python
# ✅ Start simple
import bpy
bpy.ops.mesh.primitive_cube_add()
bpy.ops.object.shade_smooth()

# Then add complexity gradually:
# - Add material
# - Add modifier
# - Increase poly count
```

**Common Cause:** Export format incompatibility or corrupted data

---

## Error: "No objects selected for export"

**Meaning:** Objects exist but weren't selected for export

**Check:**
1. Did your script create mesh objects?
2. Are they linked to a collection?

**Fix:**
```python
# ✅ Create cube (auto-linked to collection)
import bpy
bpy.ops.mesh.primitive_cube_add()

# ✅ OR manually link:
mesh = bpy.data.meshes.new("Mesh")
obj = bpy.data.objects.new("Obj", mesh)
bpy.context.collection.objects.link(obj)  # ← Important!
```

**Common Cause:** Manual object creation without collection linking

---

## Error: "Export command failed"

**Meaning:** Blender export function hit an error

**Check:**
1. Format not available in your Blender version?
2. File permissions issue?
3. Disk space issue?

**Fix:**
- Try different format: GLB → FBX → STL
- Test locally first to rule out system issues

**Common Cause:** Blender version incompatibility or corrupted export function

---

## Error: "User script error" / Traceback

**Meaning:** Your script crashed during execution

**Solution:**
1. Scroll down in error message to see traceback
2. Line number shows where it failed
3. Fix that line

**Example:**
```
File "<string>", line 12, in <module>
bpy.ops.mesh.primitive_cube_add(size=2)
bpy.ops.object.shade_smooth()
bpy.context.object.modifiers.new("Bevel", 'BEVEL')  # ← Error here
AttributeError: 'NoneType' object has no attribute 'modifiers'
```

**Meaning:** `bpy.context.object` is None (no object selected)

**Fix:**
```python
# ✅ Correct - select the object first
obj = bpy.context.active_object
obj.modifiers.new("Bevel", 'BEVEL')
```

---

## Mental Model: Why Exports Fail

```
Your Script Runs
  ↓
Does it create objects? NO → Error: "No objects"
                     YES ↓
Are they meshes?        NO → Error: "No exportable objects"
                     YES ↓
Export command runs
  ↓
Did it succeed?  NO → Error: "Export command failed"
              YES ↓
Is file > 100B?   NO → Error: "File too small"
              YES ↓
✅ SUCCESS - File uploaded!
```

---

## Quick Diagnostic Checklist

When export fails, check in order:

- [ ] Script runs without errors locally? (test in Blender)
- [ ] Creates at least one mesh object? (check viewport)
- [ ] Object linked to collection? (use bpy.ops.* functions)
- [ ] Smooth shading applied? (optional but helps)
- [ ] Material assigned? (optional)
- [ ] File size > 100 bytes? (minimal valid export)

Pass all checks? ✅ Export should work!

---

## The Nuclear Option: Start From Scratch

If stuck, use the simplest possible script:

```python
import bpy

# Step 1: ONE object
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
bpy.ops.object.shade_smooth()

# Step 2: Submit & test
# Success? → Add next feature
# Failure? → Debug this simple version
```

Once this simple version works, add features one at a time:
1. Add material
2. Add second object
3. Add modifier
4. Increase complexity

This isolates which feature is breaking export.

---

## Test Script to Rule Out System Issues

Before blaming your script, run `scripts/test_export.py`:

```python
# Download: scripts/test_export.py
# Blender: Scripting tab > New > Paste > Run
# Should see: ✅ ALL TESTS PASSED

# If test passes → Your system is OK
# If test fails → Blender/system issue (not your script)
```

---

## Examples That Should Work

Copy these and submit - they should all export successfully:

### Minimal Cube
```python
import bpy
bpy.ops.mesh.primitive_cube_add()
bpy.ops.object.shade_smooth()
```

### Cube with Material
```python
import bpy
bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.active_object
mat = bpy.data.materials.new("MyMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.2, 1.0)
cube.data.materials.append(mat)
bpy.ops.object.shade_smooth()
```

### Array of Objects
```python
import bpy
for x in range(3):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(x*2, 0, 0))
    bpy.ops.object.shade_smooth()
```

All three should export without errors!

---

## When All Else Fails

1. **Check job details page** - Read the full error message
2. **Run test script locally** - `scripts/test_export.py`
3. **Try a sample** - Copy from `scripts/SAMPLES.py`
4. **Read EXPORT_GUIDE.md** - Full troubleshooting guide
5. **Start with minimal script** - Simplify to one cube

If minimal cube exports and complex script doesn't, the problem is in your script, not the system!

---

## Key Takeaway

**Test locally first.** Blender's Scripting tab tells you immediately if something is wrong. It's way faster than uploading and waiting for BlenderLab to tell you.

```
Local test (10 seconds) > Upload to BlenderLab (1+ minute) ✅
```

---

Happy debugging! 🎯
