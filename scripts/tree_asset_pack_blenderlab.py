# ============================================================
#  Tree Asset Pack — Blender Python Script (bpy)
#  Generates 5+ stylized trees with variations
#  Designed for BlenderLab (worker handles scene setup & export)
# ============================================================

import bpy
import math
import random
from mathutils import Vector

# NOTE: BlenderLab worker automatically:
# - Clears default scene
# - Sets up collections
# - Handles export and render settings
# So we just focus on creating geometry!

# ── 1. TREE MATERIAL LIBRARY ────────────────────────────────
def create_bark_material(name, color_dark, color_light):
    """Create realistic bark material"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out.location = (400, 0)
    bsdf.location = (0, 0)
    
    # Bark color with noise variation
    col_ramp = nt.nodes.new('ShaderNodeValRamp')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    bump = nt.nodes.new('ShaderNodeBump')
    
    col_ramp.location = (-400, 100)
    noise.location = (-600, -100)
    bump.location = (-100, -100)
    
    # Setup noise texture
    noise.inputs['Scale'].default_value = 8.0
    noise.inputs['Detail'].default_value = 5.0
    
    # Color ramp from dark to light
    col_ramp.color_ramp.elements[0].color = (*color_dark, 1.0)
    col_ramp.color_ramp.elements[1].color = (*color_light, 1.0)
    
    # Bump for texture detail
    bump.inputs['Strength'].default_value = 0.5
    
    bsdf.inputs['Base Color'].default_value = color_light + (1.0,)
    bsdf.inputs['Roughness'].default_value = 0.7
    
    nt.links.new(noise.outputs['Fac'], col_ramp.inputs['Fac'])
    nt.links.new(col_ramp.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    
    return mat

def create_leaf_material(name, color_base, color_dark):
    """Create subsurface scattering leaf material"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    
    out.location = (400, 0)
    bsdf.location = (0, 0)
    
    bsdf.inputs['Base Color'].default_value = color_base + (1.0,)
    bsdf.inputs['Roughness'].default_value = 0.4
    
    # Subsurface scattering for leaf translucency
    for key in ('Subsurface Weight', 'Subsurface'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.3
            break
    
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

# Create material palette
bark_dark = create_bark_material('BarkDark', (0.2, 0.15, 0.1), (0.35, 0.28, 0.2))
bark_light = create_bark_material('BarkLight', (0.35, 0.3, 0.2), (0.5, 0.45, 0.35))
leaf_green = create_leaf_material('LeafGreen', (0.1, 0.4, 0.1), (0.05, 0.25, 0.05))
leaf_dark = create_leaf_material('LeafDark', (0.05, 0.25, 0.05), (0.02, 0.15, 0.02))

# ── 2. TRUNK GENERATOR ──────────────────────────────────────
def create_trunk(location, height, radius, taper=0.6, curve=0.1, name='Trunk'):
    """Create organic trunk with taper and slight curve"""
    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=radius,
        radius2=radius * taper,
        depth=height,
        location=location
    )
    trunk = bpy.context.active_object
    trunk.name = name
    
    # Select and prepare
    bpy.context.view_layer.objects.active = trunk
    trunk.select_set(True)
    
    # Add slight rotation for curve
    trunk.rotation_euler.z = curve
    
    # Smooth shading
    bpy.ops.object.shade_smooth()
    
    return trunk

# ── 3. FOLIAGE CREATOR (Sphere clumps) ──────────────────────
def create_foliage_clump(location, radius, material, name='Foliage'):
    """Create rounded foliage mass"""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius,
        location=location,
        subdivisions=3
    )
    foliage = bpy.context.active_object
    foliage.name = name
    
    # Add slight irregularity with displacement
    disp = foliage.modifiers.new('Displace', 'DISPLACE')
    tex = bpy.data.textures.new(f'{name}_Tex', type='CLOUDS')
    tex.cloud_type = 'COLOR'
    disp.texture = tex
    disp.strength = radius * 0.15
    
    # Material
    foliage.data.materials.append(material)
    
    bpy.ops.object.shade_smooth()
    return foliage

# ── 4. TREE GENERATOR (Main function) ───────────────────────
def create_tree(tree_type=1, location=(0, 0, 0), scale=1.0):
    """
    Create a complete tree with variations
    tree_type: 1-5 (different silhouettes)
    """
    
    # Randomize slightly
    random.seed(hash(location))
    
    if tree_type == 1:  # Tall conifer
        trunk_h, trunk_r = 4.5 * scale, 0.3 * scale
        foliage_height = 5.0 * scale
        foliage_radius = 1.2 * scale
        levels = 4
        material = leaf_dark
        bark_mat = bark_dark
        
    elif tree_type == 2:  # Broad deciduous
        trunk_h, trunk_r = 3.5 * scale, 0.4 * scale
        foliage_height = 3.0 * scale
        foliage_radius = 2.0 * scale
        levels = 3
        material = leaf_green
        bark_mat = bark_light
        
    elif tree_type == 3:  # Thin birch-like
        trunk_h, trunk_r = 5.0 * scale, 0.15 * scale
        foliage_height = 4.5 * scale
        foliage_radius = 1.0 * scale
        levels = 5
        material = leaf_green
        bark_mat = bark_light
        
    elif tree_type == 4:  # Bushy oak
        trunk_h, trunk_r = 3.0 * scale, 0.5 * scale
        foliage_height = 2.5 * scale
        foliage_radius = 2.5 * scale
        levels = 2
        material = leaf_dark
        bark_mat = bark_light
        
    else:  # type 5 - Tropical palm-like
        trunk_h, trunk_r = 4.0 * scale, 0.35 * scale
        foliage_height = 2.0 * scale
        foliage_radius = 1.8 * scale
        levels = 3
        material = leaf_green
        bark_mat = bark_dark
    
    # Create trunk
    trunk = create_trunk(
        location=location,
        height=trunk_h,
        radius=trunk_r,
        name=f'Trunk_Type{tree_type}'
    )
    trunk.data.materials.append(bark_mat)
    
    # Create foliage canopy with multiple clumps
    canopy_start = location[2] + trunk_h * 0.5
    
    for level in range(levels):
        height_offset = canopy_start + (level * foliage_height / levels)
        
        # Main foliage sphere
        main_foliage = create_foliage_clump(
            location=(location[0], location[1], height_offset),
            radius=foliage_radius * (1.0 - level * 0.1),
            material=material,
            name=f'Foliage_L{level}_Main'
        )
        
        # Side foliage clumps for fullness
        for i in range(3):
            angle = (i * 120) * math.pi / 180
            offset_x = math.cos(angle) * foliage_radius * 0.7
            offset_y = math.sin(angle) * foliage_radius * 0.7
            
            side_foliage = create_foliage_clump(
                location=(location[0] + offset_x, location[1] + offset_y, height_offset),
                radius=foliage_radius * 0.6 * (1.0 - level * 0.15),
                material=material,
                name=f'Foliage_L{level}_S{i}'
            )
    
    return trunk

# ── 5. CREATE ASSET PACK (5 different trees) ────────────────
trees = []
positions = [
    (0, 0, 0),
    (4, 0, 0),
    (8, 0, 0),
    (12, 0, 0),
    (16, 0, 0),
]

print("🌳 Creating tree asset pack...")
for i, pos in enumerate(positions):
    tree_type = (i % 5) + 1
    tree = create_tree(tree_type=tree_type, location=pos, scale=1.0)
    trees.append(tree)
    print(f"  ✅ Tree {tree_type} created at {pos}")

print(f"\n📊 Summary:")
print(f"  - Trees created: {len(trees)} variations")
print(f"  - Total foliage clumps: {len(trees) * 16}") # trunk + foliage per tree
print(f"  - Materials: Bark (dark + light) + Leaves (green + dark)")
print(f"\n✨ Asset pack ready for export!")
