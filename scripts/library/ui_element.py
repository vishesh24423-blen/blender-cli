"""
BlenderLab UI Element Generator
Usage: from ui_element import create_button, create_card, create_icon

Generates 3D UI elements for mockups and presentations.
Does NOT set materials (auto-upgrade handles that) and does NOT clear the scene.
"""

import bpy
import math


def _smooth(obj):
    """Apply smooth shading to an object."""
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    return obj


def create_button(
    width=1.2,
    height=0.4,
    label="Button",
    style='rounded'
):
    """
    Create a 3D button.

    Args:
        width: Button width
        height: Button height
        label: Text label (creates text object)
        style: 'rounded', 'flat', 'pill'

    Returns:
        list of created bpy objects
    """
    created = []

    if style == 'pill':
        # Pill shape — capsule
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=height / 2, segments=24, ring_count=12,
            location=(-width / 2 + height / 2, 0, 0)
        )
        left_cap = bpy.context.active_object

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=height / 2, segments=24, ring_count=12,
            location=(width / 2 - height / 2, 0, 0)
        )
        right_cap = bpy.context.active_object

        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, 0)
        )
        body = bpy.context.active_object
        body.scale = (width - height, height, height * 0.3)

        # Join all parts
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.select_all(action='DESELECT')
        body.select_set(True)
        left_cap.select_set(True)
        right_cap.select_set(True)
        bpy.ops.object.join()

        button = bpy.context.active_object
        button.name = f"PillButton_{label}"
        _smooth(button)
        created.append(button)

    elif style == 'flat':
        # Flat square button
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, 0)
        )
        button = bpy.context.active_object
        button.scale = (width / 2, height / 2, 0.06)
        button.name = f"FlatButton_{label}"
        _smooth(button)
        created.append(button)

    else:  # rounded (default)
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0, 0)
        )
        button = bpy.context.active_object
        button.scale = (width / 2, height / 2, 0.08)
        button.name = f"RoundedButton_{label}"

        # Bevel for rounded corners
        bevel = button.modifiers.new('Bevel', 'BEVEL')
        bevel.width = 0.05
        bevel.segments = 3

        _smooth(button)
        created.append(button)

    # Text label as a separate object (simple plane with text-like shape)
    if len(label) > 0:
        # Create text object using Blender's text object
        text_curve = bpy.data.curves.new(type='FONT', name=f"ButtonText_{label}")
        text_curve.body = label
        text_curve.size = height * 0.35
        text_curve.align = 'CENTER'

        text_obj = bpy.data.objects.new(f"Text_{label}", text_curve)
        bpy.context.collection.objects.link(text_obj)
        text_obj.location = (0, 0, 0.09)
        text_obj.rotation_euler = (1.5708, 0, 0)  # Face upward
        created.append(text_obj)

    return created


def create_card(
    width=3.0,
    height=2.0,
    depth=0.08,
    radius=0.15
):
    """
    Create a 3D card element (like a UI card).

    Args:
        width: Card width
        height: Card height
        depth: Card thickness
        radius: Corner radius

    Returns:
        list of created bpy objects
    """
    # Main card body
    bpy.ops.mesh.primitive_cube_add(
        size=1, location=(0, 0, depth / 2)
    )
    card = bpy.context.active_object
    card.scale = (width / 2, height / 2, depth / 2)
    card.name = "UICard"

    # Bevel for rounded corners
    bevel = card.modifiers.new('Bevel', 'BEVEL')
    bevel.width = radius
    bevel.segments = 4

    _smooth(card)
    return [card]


def create_icon(
    icon_type='star'
):
    """
    Create a common 3D icon shape.

    Args:
        icon_type: 'star', 'heart', 'check', 'gear', 'home', 'user', 'search', 'bell'

    Returns:
        list of created bpy objects
    """
    created = []

    if icon_type == 'star':
        # 5-pointed star using cone + rotation
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=5, radius=0.8, depth=0.2,
            location=(0, 0, 0.1)
        )
        star = bpy.context.active_object
        star.name = "StarIcon"

        # Second rotated star to create points
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=5, radius=0.8, depth=0.2,
            location=(0, 0, 0.1)
        )
        star2 = bpy.context.active_object
        star2.rotation_euler = (0, 0, 0.628)  # 36 degrees

        # Join
        bpy.context.view_layer.objects.active = star
        star2.select_set(True)
        bpy.ops.object.join()

        _smooth(star)
        created.append(star)

    elif icon_type == 'heart':
        # Heart from two spheres and a cone
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.5, segments=24, ring_count=16,
            location=(-0.35, 0, 0.3)
        )
        left = bpy.context.active_object

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.5, segments=24, ring_count=16,
            location=(0.35, 0, 0.3)
        )
        right = bpy.context.active_object

        bpy.ops.mesh.primitive_cone_add(
            vertices=32, radius1=0.7, radius2=0, depth=1.0,
            location=(0, 0, -0.1), rotation=(3.14159, 0, 0)
        )
        bottom = bpy.context.active_object

        bpy.context.view_layer.objects.active = left
        right.select_set(True)
        bottom.select_set(True)
        bpy.ops.object.join()

        heart = bpy.context.active_object
        heart.name = "HeartIcon"
        heart.scale = (1, 0.3, 1)  # Flatten
        _smooth(heart)
        created.append(heart)

    elif icon_type == 'check':
        # Checkmark from a curved path
        curve_data = bpy.data.curves.new(name="Checkmark", type='CURVE')
        curve_data.dimensions = '2D'
        curve_data.fill_mode = 'FULL'
        curve_data.bevel_depth = 0.08
        curve_data.bevel_resolution = 4

        spline = curve_data.splines.new('BEZIER')
        spline.bezier_points.add(2)

        pts = spline.bezier_points
        pts[0].co = (-0.5, 0, 0)
        pts[0].handle_right = (-0.3, 0, 0)
        pts[1].co = (-0.1, -0.3, 0)
        pts[1].handle_left = (-0.2, -0.15, 0)
        pts[1].handle_right = (0, -0.15, 0)
        pts[2].co = (0.6, 0.4, 0)
        pts[2].handle_left = (0.3, 0.2, 0)

        check_obj = bpy.data.objects.new("CheckIcon", curve_data)
        bpy.context.collection.objects.link(check_obj)
        created.append(check_obj)

    elif icon_type == 'gear':
        # Gear — cylinder with teeth
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32, radius=0.6, depth=0.2,
            location=(0, 0, 0.1)
        )
        gear = bpy.context.active_object
        gear.name = "GearIcon"

        # Teeth
        for i in range(8):
            angle = (i / 8) * math.pi * 2
            x = math.cos(angle) * 0.65
            y = math.sin(angle) * 0.65

            bpy.ops.mesh.primitive_cube_add(
                size=0.15, location=(x, y, 0.1)
            )
            tooth = bpy.context.active_object
            tooth.rotation_euler = (0, 0, angle)

            bpy.context.view_layer.objects.active = gear
            tooth.select_set(True)
            bpy.ops.object.join()

        # Center hole — just make a smaller cylinder on top to simulate it
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.2, depth=0.22,
            location=(0, 0, 0.1)
        )
        hole = bpy.context.active_object
        hole.name = "GearHole"

        _smooth(gear)
        _smooth(hole)
        created.extend([gear, hole])

    elif icon_type == 'home':
        # House icon — triangle roof + square body
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, -0.1, 0)
        )
        base = bpy.context.active_object
        base.scale = (0.6, 0.5, 0.5)
        base.name = "HomeBase"

        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(0, 0.2, 0.4)
        )
        roof = bpy.context.active_object
        roof.scale = (0.7, 0.15, 0.35)
        roof.name = "HomeRoof"

        _smooth(base)
        _smooth(roof)
        created.extend([base, roof])

    elif icon_type == 'user':
        # User icon — circle head + body shape
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.3, segments=24, ring_count=16,
            location=(0, 0, 0.7)
        )
        head = bpy.context.active_object
        head.scale = (1, 1, 1)
        head.name = "UserHead"

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.45, depth=0.5,
            location=(0, 0, 0.15)
        )
        body = bpy.context.active_object
        body.scale = (1, 1, 1)
        body.name = "UserBody"

        _smooth(head)
        _smooth(body)
        created.extend([head, body])

    elif icon_type == 'search':
        # Magnifying glass — circle + handle
        import math
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.5, minor_radius=0.06,
            major_segments=48, minor_segments=16,
            location=(0, 0, 0.3)
        )
        ring = bpy.context.active_object
        ring.name = "SearchRing"

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=12, radius=0.06, depth=0.5,
            location=(0.45, 0, 0)
        )
        handle = bpy.context.active_object
        handle.rotation_euler = (0, 0, -0.785)  # 45 degrees
        handle.name = "SearchHandle"

        _smooth(ring)
        _smooth(handle)
        created.extend([ring, handle])

    elif icon_type == 'bell':
        # Notification bell — dome + clapper
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.4, segments=24, ring_count=16,
            location=(0, 0, 0.4)
        )
        dome = bpy.context.active_object
        dome.scale = (1, 1, 0.8)
        dome.name = "BellDome"

        # Cut bottom half — scale down
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.4, depth=0.05,
            location=(0, 0, 0.1)
        )
        base = bpy.context.active_object
        base.name = "BellBase"

        # Top loop
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.1, minor_radius=0.03,
            major_segments=16, minor_segments=8,
            location=(0, 0, 0.75)
        )
        loop = bpy.context.active_object
        loop.name = "BellLoop"

        _smooth(dome)
        _smooth(base)
        _smooth(loop)
        created.extend([dome, base, loop])

    else:
        # Fallback: simple cube
        bpy.ops.mesh.primitive_cube_add(size=0.8, location=(0, 0, 0.4))
        fallback = bpy.context.active_object
        fallback.name = f"Icon_{icon_type}"
        _smooth(fallback)
        created.append(fallback)

    return created
