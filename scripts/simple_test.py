import bpy, os, sys

print("[TEST] Starting...")
sys.stdout.flush()

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

# Create a guaranteed cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "TestCube"

# Add a simple material
mat = bpy.data.materials.new("TestMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.6, 1.0, 1.0)
cube.data.materials.append(mat)

bpy.ops.object.shade_smooth()
print("[TEST] Cube created")
sys.stdout.flush()

# Export
out_dir = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
out_file = os.path.join(out_dir, 'output.glb')
os.makedirs(out_dir, exist_ok=True)

print(f"[TEST] Exporting to {out_file}")
sys.stdout.flush()

bpy.ops.export_scene.gltf(filepath=out_file, export_format='GLB')

if os.path.exists(out_file):
    print(f"[TEST] Success! File size: {os.path.getsize(out_file)} bytes")
else:
    print(f"[TEST] FAILED: File not created at {out_file}")
    sys.exit(1)

sys.stdout.flush()
print("[TEST] Done")
