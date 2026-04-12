import bpy
import math

# Create bottle body using cylinder
bpy.ops.mesh.primitive_cylinder_add(
    vertices=64,
    radius=0.035,
    depth=0.20,
    location=(0, 0, 0.10)
)
bottle = bpy.context.active_object
bottle.name = "Bottle"

# Add subdivision for smooth surface
subsurf = bottle.modifiers.new("Subdivision", 'SUBSURF')
subsurf.levels = 2

# Apply smooth shading
bpy.ops.object.shade_smooth()

# Create bottle material - translucent maroon
mat = bpy.data.materials.new("BottleMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.48, 0.07, 0.12, 1.0)
bsdf.inputs['Roughness'].default_value = 0.25
bsdf.inputs['IOR'].default_value = 1.49

# Set transmission (works for both Blender 3.x and 4.x)
for key in ('Transmission Weight', 'Transmission'):
    if key in bsdf.inputs:
        bsdf.inputs[key].default_value = 0.55
        break

bottle.data.materials.append(mat)

# Create bottle cap
bpy.ops.mesh.primitive_cylinder_add(
    vertices=48,
    radius=0.019,
    depth=0.022,
    location=(0, 0, 0.222)
)
cap = bpy.context.active_object
cap.name = "Cap"

# Cap material - opaque dark maroon
cap_mat = bpy.data.materials.new("CapMaterial")
cap_mat.use_nodes = True
cap_bsdf = cap_mat.node_tree.nodes['Principled BSDF']
cap_bsdf.inputs['Base Color'].default_value = (0.28, 0.04, 0.08, 1.0)
cap_bsdf.inputs['Roughness'].default_value = 0.55
cap.data.materials.append(cap_mat)

bpy.ops.object.shade_smooth()

print("Bottle created successfully!")
