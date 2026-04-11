"""
BlenderLab Building Generator
Usage: from building import create_building

Generates procedural buildings with different architectural styles.
Does NOT set materials (auto-upgrade handles that) and does NOT clear the scene.
"""

import bpy
import random


def _add_modifiers(obj, modifiers):
    """Helper to add modifiers and return the object."""
    for mod_data in modifiers:
        mod = obj.modifiers.new(mod_data['name'], mod_data['type'])
        for key, val in mod_data.items():
            if key not in ('name', 'type') and hasattr(mod, key):
                try:
                    setattr(mod, key, val)
                except (TypeError, AttributeError):
                    pass
    return obj


def _smooth(obj):
    """Apply smooth shading to an object."""
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    return obj


def create_building(
    floors=5,
    style='modern',
    color=(0.7, 0.75, 0.8),
    window_rows=4,
    has_roof_detail=False
):
    """
    Create a procedural building.

    Args:
        floors: Number of floors (1-20)
        style: 'modern', 'brutalist', 'glass_tower', 'residential'
        color: Base color tuple (r, g, b) — note: auto-upgrade may override
        window_rows: Number of window columns per face
        has_roof_detail: Add rooftop details (AC units, parapet)

    Returns:
        list of created bpy objects
    """
    created = []
    floor_height = 1.2
    width = 3.0
    depth = 3.0
    total_height = floors * floor_height

    if style == 'modern':
        # Main body
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, total_height / 2)
        )
        building = bpy.context.active_object
        building.scale = (width, depth, total_height)
        building.name = "ModernBuilding"

        # Bevel edges for realism
        _add_modifiers(building, [
            {'name': 'Bevel', 'type': 'BEVEL', 'width': 0.05, 'segments': 2}
        ])

        # Windows — simple inset faces per floor
        for floor in range(floors):
            for row in range(window_rows):
                z = floor * floor_height + floor_height * 0.5
                x_offset = -width / 2 + (row + 0.5) * (width / window_rows)

                # Front windows
                bpy.ops.mesh.plane_add(size=0.5, location=(x_offset, depth / 2 + 0.01, z))
                win = bpy.context.active_object
                win.name = f"Window_F_{floor}_{row}"
                created.append(win)

        _smooth(building)
        created.append(building)

    elif style == 'brutalist':
        # Thick, heavy concrete look with offset blocks
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, total_height / 2)
        )
        building = bpy.context.active_object
        building.scale = (width * 1.2, depth * 1.2, total_height)
        building.name = "BrutalistBuilding"

        # Add protruding floor slabs
        for floor in range(floors):
            z = floor * floor_height + floor_height * 0.5
            bpy.ops.mesh.primitive_cube_add(
                size=1, location=(0, 0, z)
            )
            slab = bpy.context.active_object
            slab.scale = (width * 1.4, depth * 1.4, floor_height * 0.15)
            slab.name = f"Slab_{floor}"
            _smooth(slab)
            created.append(slab)

        _smooth(building)
        created.append(building)

    elif style == 'glass_tower':
        # Tall glass tower with cylindrical shape
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32, radius=width / 2, depth=total_height,
            location=(0, 0, total_height / 2)
        )
        building = bpy.context.active_object
        building.name = "GlassTower"

        # Subdivision for smooth look
        _add_modifiers(building, [
            {'name': 'Subdivision', 'type': 'SUBSURF', 'levels': 1}
        ])

        _smooth(building)
        created.append(building)

    elif style == 'residential':
        # House-like with pitched roof
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, total_height * 0.4)
        )
        building = bpy.context.active_object
        building.scale = (width * 1.5, depth * 1.2, total_height * 0.8)
        building.name = "ResidentialBuilding"

        # Pitched roof
        if floors <= 3:
            bpy.ops.mesh.primitive_cube_add(
                size=1, location=(0, 0, total_height * 0.8 + total_height * 0.2)
            )
            roof = bpy.context.active_object
            roof.scale = (width * 1.6, depth * 1.3, total_height * 0.35)
            roof.name = "PitchedRoof"
            _smooth(roof)
            created.append(roof)

        _smooth(building)
        created.append(building)

    else:
        # Fallback: simple box
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, total_height / 2)
        )
        building = bpy.context.active_object
        building.scale = (width, depth, total_height)
        building.name = f"Building_{style}"
        _smooth(building)
        created.append(building)

    # Roof details
    if has_roof_detail and floors > 2:
        roof_z = total_height
        # AC unit
        bpy.ops.mesh.primitive_cube_add(
            size=0.4, location=(width * 0.3, depth * 0.3, roof_z + 0.2)
        )
        ac = bpy.context.active_object
        ac.name = "AC_Unit"
        _smooth(ac)
        created.append(ac)

        # Parapet
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, roof_z + 0.15)
        )
        parapet = bpy.context.active_object
        parapet.scale = (width + 0.2, depth + 0.2, 0.3)
        parapet.name = "Parapet"
        _smooth(parapet)
        created.append(parapet)

    return created
