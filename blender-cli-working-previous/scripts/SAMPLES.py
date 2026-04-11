# ============================================================
#  BlenderLab Sample Scripts - Best Practices Guide
#  All scripts follow export-friendly patterns
# ============================================================

# SAMPLE 1: Simple Cube (Minimal)
# ─────────────────────────────────
import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "SimpleCube"

# Apply smooth shading for better visuals
bpy.ops.object.shade_smooth()


# SAMPLE 2: Procedural Torus with Material
# ──────────────────────────────────────────
# import bpy
# import math
# 
# # Create torus using geometry nodes or modifier
# bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0))
# torus = bpy.context.active_object
# torus.name = "Torus"
# 
# # Add material
# mat = bpy.data.materials.new("TorusMaterial")
# mat.use_nodes = True
# bsdf = mat.node_tree.nodes['Principled BSDF']
# bsdf.inputs['Base Color'].default_value = (0.2, 0.5, 0.9, 1.0)
# bsdf.inputs['Roughness'].default_value = 0.4
# 
# torus.data.materials.append(mat)
# bpy.ops.object.shade_smooth()


# SAMPLE 3: Array of Objects
# ──────────────────────────
# import bpy
# import math
# 
# # Create a grid of spheres
# for x in range(-2, 3):
#     for y in range(-2, 3):
#         bpy.ops.mesh.primitive_uv_sphere_add(radius=0.4, location=(x*1.2, y*1.2, 0))
#         sphere = bpy.context.active_object
#         sphere.name = f"Sphere_{x}_{y}"
#         bpy.ops.object.shade_smooth()


# SAMPLE 4: Custom Mesh from Vertices
# ────────────────────────────────────
# import bpy
# 
# # Define vertices and faces for a custom shape
# verts = [
#     (0,    0,    0),     # 0
#     (1,    0,    0),     # 1
#     (1,    1,    0),     # 2
#     (0,    1,    0),     # 3
#     (0.5,  0.5,  1.5),   # 4 (apex)
# ]
# 
# faces = [
#     (0, 1, 4),   # triangle faces to apex
#     (1, 2, 4),
#     (2, 3, 4),
#     (3, 0, 4),
#     (0, 1, 2, 3),  # base quad
# ]
# 
# mesh = bpy.data.meshes.new("CustomPyramid")
# mesh.from_pydata(verts, [], faces)
# mesh.update()
# 
# obj = bpy.data.objects.new("Pyramid", mesh)
# bpy.context.collection.objects.link(obj)
# bpy.ops.object.shade_smooth()


# KEY TIPS FOR SUCCESSFUL EXPORTS:
# ================================
# 1. Always create objects using bpy.ops.* functions or manually via bpy.data.objects.new()
# 2. Link objects to a collection: bpy.context.collection.objects.link(obj)
# 3. Use bpy.ops.object.shade_smooth() for better appearance
# 4. Apply materials with proper node setups
# 5. Avoid exporting cameras, lights - focus on mesh objects
# 6. Use simple geometries (cubes, spheres, cylinders) if testing
# 7. Complex scripts may take longer - optimize with fewer vertices/faces
# 8. Test your script locally in Blender first!
#
# SUPPORTED EXPORT FORMATS:
# ────────────────────────
# - GLB (Recommended): glTF binary format, best for web
# - FBX: Universal 3D format, widely supported
# - STL: 3D printing format, mesh only
# - USD: Pixar's universal format, growing support
# - OBJ: ⚠️  Currently disabled (Blender 5.x snap issue)
#
# The export script automatically:
# ✓ Selects all mesh objects in the scene
# ✓ Removes cameras and lights before export
# ✓ Applies materials and textures
# ✓ Handles failures with fallback options
# ✓ Uploads successful exports to cloud storage
