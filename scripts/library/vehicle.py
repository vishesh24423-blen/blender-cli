"""
BlenderLab Vehicle Generator
Usage: from vehicle import create_car

Generates procedural vehicles using curve bodies + solidify + subdivision.
Does NOT set materials (auto-upgrade handles that) and does NOT clear the scene.
"""

import bpy


def _smooth(obj):
    """Apply smooth shading to an object."""
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    return obj


def _add_wheel(location, radius=0.35):
    """Create a single wheel at the given location."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24, radius=radius, depth=0.25,
        location=location, rotation=(0, 1.5708, 0)  # 90° on Y
    )
    wheel = bpy.context.active_object
    wheel.name = f"Wheel_{location[0]}_{location[1]}"

    # Hub
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=radius * 0.3, depth=0.26,
        location=location, rotation=(0, 1.5708, 0)
    )
    hub = bpy.context.active_object
    hub.name = f"Hub_{location[0]}_{location[1]}"

    _smooth(wheel)
    _smooth(hub)
    return wheel, hub


def create_car(
    car_type='sedan',
    color=(0.8, 0.1, 0.1),
    detail_level='medium'
):
    """
    Create a stylized car model.

    Args:
        car_type: 'sedan', 'suv', 'sports', 'truck'
        color: Body color tuple (r, g, b)
        detail_level: 'low', 'medium', 'high'

    Returns:
        list of created bpy objects
    """
    created = []

    dimensions = {
        'sedan':  {'length': 4.5, 'width': 1.8, 'height': 1.4, 'wheel_r': 0.35, 'ground_z': 0.35},
        'suv':    {'length': 4.8, 'width': 2.0, 'height': 1.8, 'wheel_r': 0.4,  'ground_z': 0.4},
        'sports': {'length': 4.4, 'width': 1.9, 'height': 1.2, 'wheel_r': 0.35, 'ground_z': 0.35},
        'truck':  {'length': 5.5, 'width': 2.0, 'height': 2.0, 'wheel_r': 0.45, 'ground_z': 0.45},
    }

    dims = dimensions.get(car_type, dimensions['sedan'])
    L, W, H = dims['length'], dims['width'], dims['height']
    wheel_r = dims['wheel_r']
    ground_z = dims['ground_z']

    # ── Body (main lower body) ─────────────────────────────────────
    bpy.ops.mesh.primitive_cube_add(
        size=1, location=(0, 0, ground_z + H * 0.3)
    )
    body = bpy.context.active_object
    body.scale = (L * 0.5, W * 0.5, H * 0.35)
    body.name = f"{car_type.capitalize()}Body"

    if detail_level in ('medium', 'high'):
        body.modifiers.new('Bevel', 'BEVEL').width = 0.08
        body.modifiers['Bevel'].segments = 3

    _smooth(body)
    created.append(body)

    # ── Cabin / greenhouse ──────────────────────────────────────────
    cabin_length = L * 0.35 if car_type == 'sports' else L * 0.3
    cabin_height = H * 0.35
    cabin_width = W * 0.42
    cabin_x = -L * 0.05 if car_type == 'sedan' else L * 0.05

    bpy.ops.mesh.primitive_cube_add(
        size=1, location=(cabin_x, 0, ground_z + H * 0.3 + cabin_height * 0.5)
    )
    cabin = bpy.context.active_object
    cabin.scale = (cabin_length * 0.5, cabin_width * 0.5, cabin_height * 0.5)
    cabin.name = f"{car_type.capitalize()}Cabin"

    # Slope the cabin front for sports cars
    if car_type == 'sports':
        cabin.rotation_euler = (0.15, 0, 0)

    if detail_level in ('medium', 'high'):
        cabin.modifiers.new('Bevel', 'BEVEL').width = 0.05
        cabin.modifiers['Bevel'].segments = 2

    _smooth(cabin)
    created.append(cabin)

    # ── Wheels ──────────────────────────────────────────────────────
    wheel_positions = [
        (L * 0.3, W * 0.48, ground_z),   # front-right
        (L * 0.3, -W * 0.48, ground_z),   # front-left
        (-L * 0.3, W * 0.48, ground_z),   # rear-right
        (-L * 0.3, -W * 0.48, ground_z),  # rear-left
    ]
    for pos in wheel_positions:
        wheel, hub = _add_wheel(pos, radius=wheel_r)
        created.extend([wheel, hub])

    # ── High detail extras ──────────────────────────────────────────
    if detail_level == 'high':
        # Headlights
        for side in [1, -1]:
            bpy.ops.mesh.primitive_uv_sphere_add(
                radius=0.12, segments=16, ring_count=8,
                location=(L * 0.25, side * W * 0.4, ground_z + H * 0.35)
            )
            light = bpy.context.active_object
            light.scale = (1, 0.6, 0.5)
            light.name = f"Headlight_{'R' if side > 0 else 'L'}"
            _smooth(light)
            created.append(light)

        # Taillights
        for side in [1, -1]:
            bpy.ops.mesh.primitive_cube_add(
                size=0.15, location=(-L * 0.25, side * W * 0.4, ground_z + H * 0.35)
            )
            tail = bpy.context.active_object
            tail.scale = (0.5, 1.5, 0.8)
            tail.name = f"Taillight_{'R' if side > 0 else 'L'}"
            _smooth(tail)
            created.append(tail)

        # Spoiler for sports car
        if car_type == 'sports':
            bpy.ops.mesh.primitive_cube_add(
                size=0.08, location=(-L * 0.22, 0, ground_z + H * 0.65)
            )
            spoiler = bpy.context.active_object
            spoiler.scale = (W * 0.8, 0.3, 1)
            spoiler.name = "Spoiler"

            # Supports
            for side in [1, -1]:
                bpy.ops.mesh.primitive_cylinder_add(
                    vertices=8, radius=0.03, depth=0.15,
                    location=(-L * 0.22, side * W * 0.3, ground_z + H * 0.58)
                )
                support = bpy.context.active_object
                support.name = f"SpoilerSupport_{'R' if side > 0 else 'L'}"
                created.append(support)

            _smooth(spoiler)
            created.append(spoiler)

        # Truck bed
        if car_type == 'truck':
            bpy.ops.mesh.primitive_cube_add(
                size=1, location=(-L * 0.15, 0, ground_z + H * 0.2)
            )
            bed = bpy.context.active_object
            bed.scale = (L * 0.2, W * 0.45, H * 0.15)
            bed.name = "TruckBed"
            _smooth(bed)
            created.append(bed)

    return created
