import bpy
from math import radians

# -----------------------
# Helper: Create Material
# -----------------------
def create_material(name, color, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

# -----------------------
# Materials
# -----------------------
wall_mat = create_material("Wall", (0.8, 0.7, 0.6), 0.9)
roof_mat = create_material("Roof", (0.3, 0.05, 0.05), 0.4)
door_mat = create_material("Door", (0.2, 0.1, 0.05), 0.6)
glass_mat = create_material("Glass", (0.6, 0.8, 1.0), 0.05)

glass_bsdf = glass_mat.node_tree.nodes["Principled BSDF"]
glass_bsdf.inputs["Transmission"].default_value = 1
glass_bsdf.inputs["Roughness"].default_value = 0.02

# -----------------------
# House Base (Walls)
# -----------------------
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1))
walls = bpy.context.object
walls.name = "Walls"
walls.scale = (3, 4, 1.5)
walls.data.materials.append(wall_mat)

# Solidify modifier (thickness)
solid = walls.modifiers.new(name="Solidify", type='SOLIDIFY')
solid.thickness = 0.15

# Smooth shading
bpy.ops.object.shade_smooth()

# -----------------------
# Roof
# -----------------------
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 3))
roof = bpy.context.object
roof.name = "Roof"
roof.scale = (3.2, 4.2, 0.6)
roof.rotation_euler[0] = radians(45)
roof.data.materials.append(roof_mat)

# Smooth shading
bpy.ops.object.shade_smooth()

# -----------------------
# Door
# -----------------------
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -4.01, 0.9))
door = bpy.context.object
door.name = "Door"
door.scale = (0.7, 0.1, 1.0)
door.data.materials.append(door_mat)

# Bevel modifier for realism
bevel = door.modifiers.new(name="Bevel", type='BEVEL')
bevel.width = 0.02
bevel.segments = 3

# Smooth shading
bpy.ops.object.shade_smooth()

# -----------------------
# Windows
# -----------------------
window_positions = [
    (-1.5, -4.01, 1.6),
    (1.5, -4.01, 1.6),
    (-1.5, 4.01, 1.6),
    (1.5, 4.01, 1.6),
]

for i, pos in enumerate(window_positions):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    win = bpy.context.object
    win.name = f"Window_{i}"
    win.scale = (0.6, 0.1, 0.5)
    win.data.materials.append(glass_mat)
    bpy.ops.object.shade_smooth()

# -----------------------
# Ground (Optional)
# -----------------------
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.01))
ground = bpy.context.object
ground.name = "Ground"
ground_mat = create_material("Ground", (0.2, 0.25, 0.2), 1.0)
ground.data.materials.append(ground_mat)
bpy.ops.object.shade_smooth()

# -----------------------
# CRITICAL: Select all mesh objects for BlenderLab export
# -----------------------
for obj in bpy.data.objects:
    obj.select_set(False)

for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

print(f"✅ House created with {len([o for o in bpy.data.objects if o.type == 'MESH'])} mesh objects ready for export")
