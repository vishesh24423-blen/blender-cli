"""
BlenderLab Abstract Shape Generator
Usage: from abstract import create_blob, create_crystal, create_torus_knot

Generates procedural abstract/art shapes.
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


def create_blob(
    scale=2.0,
    complexity=3
):
    """
    Create an organic blob shape using metaballs.

    Args:
        scale: Overall size of the blob
        complexity: Number of metaball elements (1-10)

    Returns:
        list of created bpy objects
    """
    complexity = max(1, min(complexity, 10))

    # Create metaball object
    mball = bpy.data.metaballs.new("BlobMeta")
    mball.resolution = 0.05  # Higher resolution = smoother
    mball.render_resolution = 0.03

    # Add elements
    for i in range(complexity):
        angle = (i / max(complexity, 1)) * math.pi * 2
        radius = scale * 0.3

        x = math.cos(angle) * radius * random.uniform(0.3, 0.8)
        y = math.sin(angle) * radius * random.uniform(0.3, 0.8)
        z = random.uniform(-scale * 0.2, scale * 0.3)

        ele = mball.elements.new(type='BALL')
        ele.co = (x, y, z)
        ele.radius = scale * random.uniform(0.15, 0.35)

    # Create metaball object
    mball_obj = bpy.data.objects.new("Blob", mball)
    bpy.context.collection.objects.link(mball_obj)
    mball_obj.location = (0, 0, scale * 0.3)

    return [mball_obj]


def create_crystal(
    sides=6,
    height=3.0
):
    """
    Create a crystal/gem shape — cone array with rotation.

    Args:
        sides: Number of crystal faces (3-12)
        height: Total crystal height

    Returns:
        list of created bpy objects
    """
    created = []

    # Main crystal body — elongated cone
    bpy.ops.mesh.primitive_cone_add(
        vertices=sides,
        radius1=height * 0.3,
        radius2=height * 0.05,
        depth=height,
        location=(0, 0, height / 2)
    )
    crystal = bpy.context.active_object
    crystal.name = f"Crystal_{sides}sides"

    # Add bevel for sharper edges
    crystal.modifiers.new('Bevel', 'BEVEL').width = 0.02
    crystal.modifiers['Bevel'].segments = 1

    _smooth(crystal)
    created.append(crystal)

    # Secondary smaller crystal at an angle
    bpy.ops.mesh.primitive_cone_add(
        vertices=max(3, sides - 2),
        radius1=height * 0.15,
        radius2=height * 0.03,
        depth=height * 0.6,
        location=(height * 0.2, height * 0.15, height * 0.3)
    )
    small_crystal = bpy.context.active_object
    small_crystal.name = f"CrystalSmall_{sides}sides"
    small_crystal.rotation_euler = (0.3, -0.2, 0.5)

    small_crystal.modifiers.new('Bevel', 'BEVEL').width = 0.015
    small_crystal.modifiers['Bevel'].segments = 1

    _smooth(small_crystal)
    created.append(small_crystal)

    # Base platform
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=sides,
        radius=height * 0.4,
        depth=height * 0.08,
        location=(0, 0, 0)
    )
    base = bpy.context.active_object
    base.name = "CrystalBase"
    _smooth(base)
    created.append(base)

    return created


def create_torus_knot(
    p=2,
    q=3,
    radius=1.5
):
    """
    Create a torus knot curve.

    Args:
        p: The p parameter of the torus knot (1-5)
        q: The q parameter of the torus knot (1-5)
        radius: Overall size of the knot

    Returns:
        list of created bpy objects
    """
    # Use math to generate torus knot curve points
    curve_data = bpy.data.curves.new(name="TorusKnot", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.fill_mode = 'FULL'
    curve_data.bevel_depth = radius * 0.06
    curve_data.bevel_resolution = 8

    spline = curve_data.splines.new('POLY')

    num_points = 512
    spline.points.add(num_points - 1)  # Start with 1 point, add more

    for i in range(num_points):
        t = (i / num_points) * 2 * math.pi
        R = radius * 0.5
        r = radius * 0.2

        x = (R + r * math.cos(q * t)) * math.cos(p * t)
        y = (R + r * math.cos(q * t)) * math.sin(p * t)
        z = r * math.sin(q * t)

        spline.points[i].co = (x, y, z, 1.0)

    knot_obj = bpy.data.objects.new("TorusKnot", curve_data)
    bpy.context.collection.objects.link(knot_obj)
    knot_obj.name = f"TorusKnot_p{p}_q{q}"

    return [knot_obj]
