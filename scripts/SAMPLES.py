# BlenderLab Sample Scripts
# All scripts are tested and working with Blender 5.0+

# SAMPLE 1: Simple Cube
import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "SimpleCube"
bpy.ops.object.shade_smooth()


# SAMPLE 2: Cube with Material
# import bpy
# 
# bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
# cube = bpy.context.active_object
# cube.name = "ColoredCube"
# 
# mat = bpy.data.materials.new("BlueMaterial")
# mat.use_nodes = True
# bsdf = mat.node_tree.nodes['Principled BSDF']
# bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)
# bsdf.inputs['Roughness'].default_value = 0.5
# cube.data.materials.append(mat)
# bpy.ops.object.shade_smooth()


# SAMPLE 3: Cube with Subdivision
# import bpy
# 
# bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
# cube = bpy.context.active_object
# cube.name = "SmoothCube"
# 
# modifier = cube.modifiers.new("Subdivision", 'SUBSURF')
# modifier.levels = 2
# 
# bpy.ops.object.shade_smooth()


# SAMPLE 4: Multiple Objects
# import bpy
# 
# for i in range(3):
#     bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(i*2, 0, 0))
#     sphere = bpy.context.active_object
#     sphere.name = f"Sphere_{i}"
#     bpy.ops.object.shade_smooth()


# SAMPLE 5: Custom Pyramid
# import bpy
# 
# vertices = [
#     (0, 0, 0),
#     (1, 0, 0),
#     (1, 1, 0),
#     (0, 1, 0),
#     (0.5, 0.5, 1.5),
# ]
# 
# faces = [
#     (0, 1, 4),
#     (1, 2, 4),
#     (2, 3, 4),
#     (3, 0, 4),
#     (0, 1, 2, 3),
# ]
# 
# mesh = bpy.data.meshes.new("PyramidMesh")
# mesh.from_pydata(vertices, [], faces)
# mesh.update()
# 
# obj = bpy.data.objects.new("Pyramid", mesh)
# bpy.context.collection.objects.link(obj)
# bpy.ops.object.shade_smooth()
