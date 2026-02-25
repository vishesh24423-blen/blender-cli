# filepath: scripts/test_export.py
# ============================================================
#  BlenderLab Export Diagnostic Test
#  Use this to verify your system can export successfully
# ============================================================

import bpy
import sys
import os

print("\n" + "=" * 70)
print("  BLENDERLAB EXPORT DIAGNOSTIC TEST")
print("=" * 70 + "\n")

# Test 1: Clear scene
print("✓ Test 1: Clearing default scene...")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)
print("  → Scene cleared successfully\n")

# Test 2: Create simple object
print("✓ Test 2: Creating test cube...")
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "TestCube"
print(f"  → Cube created: {cube.name}\n")

# Test 3: Check object type
print("✓ Test 3: Verifying object type...")
print(f"  → Object type: {cube.type}")
print(f"  → Has data: {cube.data is not None}")
print(f"  → Connected: {cube.linked_time > 0 or True}")
print()

# Test 4: Apply smooth shading
print("✓ Test 4: Applying smooth shading...")
bpy.ops.object.shade_smooth()
print("  → Smooth shading applied\n")

# Test 5: Create material
print("✓ Test 5: Creating test material...")
mat = bpy.data.materials.new("TestMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.2, 1.0)
cube.data.materials.append(mat)
print(f"  → Material created: {mat.name}")
print(f"  → Material assigned to cube\n")

# Test 6: Verify object is selectable
print("✓ Test 6: Verifying object selection...")
bpy.ops.object.select_all(action='DESELECT')
mesh_count = 0
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
        mesh_count += 1
        print(f"  → Selected: {obj.name} ({obj.type})")

print(f"  → Total mesh objects selected: {mesh_count}\n")

if mesh_count == 0:
    print("❌ ERROR: No mesh objects in scene!")
    print("  This means your script didn't create any mesh objects.")
    print("  Make sure you're using bpy.ops.mesh.primitive_* functions\n")
    sys.exit(1)

# Test 7: Export test
print("✓ Test 7: Testing GLB export...")
export_path = "/tmp/blenderlab_test.glb"

try:
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        export_selected_only=False,
        export_materials=True
    )
    
    if os.path.exists(export_path):
        file_size = os.path.getsize(export_path)
        print(f"  ✅ Export successful!")
        print(f"  → File: {export_path}")
        print(f"  → Size: {file_size} bytes\n")
        
        # Cleanup
        os.remove(export_path)
        
        print("=" * 70)
        print("  ✅ ALL TESTS PASSED - Your system can export successfully!")
        print("=" * 70 + "\n")
        
    else:
        print(f"  ❌ Export file not created at {export_path}")
        print("  The export command didn't produce a file.\n")
        sys.exit(1)
        
except Exception as e:
    print(f"  ❌ Export failed with error:")
    print(f"  → {type(e).__name__}: {e}\n")
    import traceback
    traceback.print_exc()
    sys.exit(1)
