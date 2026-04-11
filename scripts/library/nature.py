"""
BlenderLab Nature Generator
Usage: from nature import create_tree, create_rock, create_grass_patch

Generates procedural nature elements.
Does NOT set materials (auto-upgrade handles that) and does NOT clear the scene.
"""

import bpy
import math
import random


def _smooth(obj):
    """Apply smooth shading to an object."""
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    return obj


def create_tree(
    species='oak',
    height=5.0,
    color=(0.15, 0.55, 0.1)
):
    """
    Create a procedural tree.

    Args:
        species: 'oak', 'pine', 'palm', 'birch', 'willow'
        height: Total tree height in Blender units
        color: Foliage color tuple (r, g, b)

    Returns:
        list of created bpy objects
    """
    created = []
    trunk_height = height * 0.4

    # ── Trunk ───────────────────────────────────────────────────────
    if species == 'birch':
        # Thin, white trunk
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=12, radius=0.12, depth=trunk_height,
            location=(0, 0, trunk_height / 2)
        )
    else:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=10, radius=0.2, depth=trunk_height,
            location=(0, 0, trunk_height / 2)
        )

    trunk = bpy.context.active_object
    trunk.name = f"{species.capitalize()}Trunk"

    # Slight taper using scale
    trunk.scale = (1, 1, 1)

    _smooth(trunk)
    created.append(trunk)

    # ── Foliage ─────────────────────────────────────────────────────
    foliage_start_z = trunk_height

    if species == 'oak':
        # Round, full canopy made of overlapping spheres
        canopy_radius = height * 0.35
        canopy_center = (0, 0, foliage_start_z + canopy_radius * 0.5)

        # Main canopy
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=canopy_radius, segments=24, ring_count=16,
            location=canopy_center
        )
        canopy = bpy.context.active_object
        canopy.name = "OakCanopy"
        _smooth(canopy)
        created.append(canopy)

        # Extra bumps for organic look
        for _ in range(3):
            angle = random.uniform(0, math.pi * 2)
            offset = canopy_radius * 0.5
            x = math.cos(angle) * offset
            y = math.sin(angle) * offset
            z = canopy_center[2] + random.uniform(-canopy_radius * 0.3, canopy_radius * 0.3)

            bpy.ops.mesh.primitive_uv_sphere_add(
                radius=canopy_radius * 0.5, segments=16, ring_count=12,
                location=(x, y, z)
            )
            bump = bpy.context.active_object
            bump.name = f"OakBump_{len(created)}"
            _smooth(bump)
            created.append(bump)

    elif species == 'pine':
        # Layered cones
        layers = max(3, int(height / 1.5))
        for layer in range(layers):
            z = foliage_start_z + layer * (height - foliage_start_z) / layers
            radius = (height * 0.3) * (1 - layer / (layers + 1))
            cone_h = (height - foliage_start_z) / layers * 1.2

            bpy.ops.mesh.primitive_cone_add(
                vertices=12, radius1=radius, radius2=0, depth=cone_h,
                location=(0, 0, z + cone_h / 2)
            )
            cone = bpy.context.active_object
            cone.name = f"PineLayer_{layer}"
            _smooth(cone)
            created.append(cone)

    elif species == 'palm':
        # Fronds — curved planes radiating from top
        top_z = trunk_height + 0.3
        frond_count = 8
        frond_length = height * 0.5

        for i in range(frond_count):
            angle = (i / frond_count) * math.pi * 2

            # Create a curved frond using a bezier curve
            curve_data = bpy.data.curves.new(name=f"PalmFrond_{i}", type='CURVE')
            curve_data.dimensions = '3D'
            curve_data.fill_mode = 'FULL'

            spline = curve_data.splines.new('BEZIER')
            spline.bezier_points.add(2)  # 3 points total

            # Start at trunk top, curve outward and droop
            pts = spline.bezier_points
            pts[0].co = (0, 0, top_z)
            pts[0].handle_left = (0, 0, top_z)
            pts[0].handle_right = (0.3, 0, top_z + 0.3)

            mid_x = math.cos(angle) * frond_length * 0.5
            mid_y = math.sin(angle) * frond_length * 0.5
            pts[1].co = (mid_x, mid_y, top_z + frond_length * 0.2)
            pts[1].handle_left = (mid_x * 0.7, mid_y * 0.7, top_z + 0.5)
            pts[1].handle_right = (mid_x * 1.3, mid_y * 1.3, top_z + 0.3)

            end_x = math.cos(angle) * frond_length
            end_y = math.sin(angle) * frond_length
            pts[2].co = (end_x, end_y, top_z - frond_length * 0.3)
            pts[2].handle_left = (end_x * 0.9, end_y * 0.9, top_z - 0.1)
            pts[2].handle_right = (end_x, end_y, top_z - frond_length * 0.3)

            curve_obj = bpy.data.objects.new(f"PalmFrond_{i}", curve_data)
            bpy.context.collection.objects.link(curve_obj)
            curve_obj.data.bevel_depth = 0.08
            created.append(curve_obj)

    elif species == 'willow':
        # Drooping branches from top
        top_z = trunk_height
        branch_count = 12
        branch_length = height * 0.6

        for i in range(branch_count):
            angle = (i / branch_count) * math.pi * 2

            curve_data = bpy.data.curves.new(name=f"WillowBranch_{i}", type='CURVE')
            curve_data.dimensions = '3D'
            curve_data.fill_mode = 'FULL'

            spline = curve_data.splines.new('BEZIER')
            spline.bezier_points.add(2)

            pts = spline.bezier_points
            pts[0].co = (0, 0, top_z)
            pts[0].handle_right = (0.2, 0, top_z + 0.2)

            mid_x = math.cos(angle) * branch_length * 0.4
            mid_y = math.sin(angle) * branch_length * 0.4
            pts[1].co = (mid_x, mid_y, top_z - branch_length * 0.1)

            end_x = math.cos(angle) * branch_length * 0.7
            end_y = math.sin(angle) * branch_length * 0.7
            pts[2].co = (end_x, end_y, top_z - branch_length * 0.6)

            curve_obj = bpy.data.objects.new(f"WillowBranch_{i}", curve_data)
            bpy.context.collection.objects.link(curve_obj)
            curve_obj.data.bevel_depth = 0.04
            created.append(curve_obj)

    else:
        # Default: simple sphere canopy
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=height * 0.3, segments=20, ring_count=14,
            location=(0, 0, foliage_start_z + height * 0.2)
        )
        canopy = bpy.context.active_object
        canopy.name = f"{species.capitalize()}Canopy"
        _smooth(canopy)
        created.append(canopy)

    return created


def create_rock(
    size=1.0,
    roughness=0.7
):
    """
    Create a procedural rock using displaced icosphere.

    Args:
        size: Overall scale of the rock
        roughness: 0 = smooth, 1 = very jagged (0-1)

    Returns:
        list of created bpy objects (single rock)
    """
    # Start with an icosphere for organic base shape
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3, radius=size, location=(0, 0, size * 0.3)
    )
    rock = bpy.context.active_object
    rock.name = f"Rock_{size}"

    # Displace vertices for natural look
    disp_mod = rock.modifiers.new('Displace', 'DISPLACE')
    tex = bpy.data.textures.new(f"RockTex_{id(rock)}", 'CLOUDS')
    tex.noise_scale = 2.0 + roughness * 3.0
    tex.noise_depth = int(roughness * 4)
    disp_mod.texture = tex
    disp_mod.strength = size * 0.15 * roughness
    disp_mod.mid_level = 0.5

    # Subdivision for smoothness
    rock.modifiers.new('Subdivision', 'SUBSURF').levels = 1

    # Randomize scale slightly for variety
    sx = 1 + random.uniform(-0.2, 0.2)
    sy = 1 + random.uniform(-0.2, 0.2)
    sz = 1 + random.uniform(-0.3, 0.1)  # Flatter
    rock.scale = (sx, sy, sz)

    _smooth(rock)
    return [rock]


def create_grass_patch(
    density=50,
    area=(4, 4)
):
    """
    Create a grass patch with many individual grass blades.

    Args:
        density: Number of grass blades
        area: (width, depth) tuple for the grass area

    Returns:
        list of created bpy objects
    """
    created = []
    width, depth = area

    # Create a single grass blade as a tapered plane
    bpy.ops.mesh.primitive_plane_add(size=0.1, location=(0, 0, 0))
    blade_base = bpy.context.active_object

    # Extrude upward to make it a blade
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.transform.resize(value=(1, 1, 1))
    bpy.ops.object.mode_set(mode='OBJECT')

    blade_base.name = "GrassBlade_Base"
    blade_base.data.vertices[0].co[2] = 0
    blade_base.data.vertices[1].co[2] = 0
    blade_base.data.vertices[2].co[2] = 0.6
    blade_base.data.vertices[3].co[2] = 0.6

    # Make it narrower at the top
    blade_base.data.vertices[2].co[0] *= 0.3
    blade_base.data.vertices[3].co[0] *= 0.3
    blade_base.data.vertices[2].co[1] *= 0.3
    blade_base.data.vertices[3].co[1] *= 0.3

    _smooth(blade_base)

    # Instance the blade across the area using a particle-like approach
    # Since we can't use particle systems reliably, we duplicate manually
    for i in range(min(density, 200)):  # Cap at 200 for performance
        x = random.uniform(-width / 2, width / 2)
        y = random.uniform(-depth / 2, depth / 2)
        z = 0

        blade = blade_base.copy()
        blade.data = blade_base.data.copy()
        blade.location = (x, y, z)
        blade.rotation_euler = (
            random.uniform(-0.15, 0.15),  # Slight tilt
            random.uniform(-0.15, 0.15),
            random.uniform(0, math.pi * 2)  # Random rotation
        )
        blade.scale = (
            random.uniform(0.7, 1.3),
            random.uniform(0.7, 1.3),
            random.uniform(0.8, 1.5)
        )
        blade.name = f"Grass_{i}"
        bpy.context.collection.objects.link(blade)
        created.append(blade)

    # Remove the original
    bpy.data.objects.remove(blade_base, do_unlink=True)

    return created
