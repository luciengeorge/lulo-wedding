"""One sun and a physical sky, driven by a named time of day. Dusk is the
spec's hero light: low amber sun, windows and lanterns coming on."""

import math

import bpy

# The sun comes from over the sea, as it does on that coast in the afternoon, so
# shadows rake across the frame toward the viewer instead of falling away behind
# every object. The sky is a physical model and is bright: it is kept to a few
# percent so the sun, not the ambient, draws the shadows.
TIMES = {
    "afternoon": {
        "elevation": 28.0,
        "azimuth": 300.0,
        "sun_energy": 5.5,
        "sun_color": (1.0, 0.95, 0.86),
        "sky_strength": 0.03,
        "air": 1.0,
        "ozone": 1.0,
        "exposure": -0.5,
        "windows": 0.0,
        "lanterns": 0.0,
    },
    "dusk": {
        "elevation": 6.0,
        "azimuth": 278.0,
        "sun_energy": 3.0,
        "sun_color": (1.0, 0.7, 0.42),
        "sky_strength": 0.04,
        "air": 1.7,
        "ozone": 1.5,
        "exposure": -0.2,
        "windows": 7.0,
        "lanterns": 12.0,
    },
}


def setup(scene):
    for name in ("sun", "world"):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.angle = math.radians(1.8)
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False
    sky.altitude = 0.0
    links.new(sky.outputs["Color"], nodes["Background"].inputs["Color"])
    scene.world = world


def set_time(scene, name):
    t = TIMES[name]
    elev, azim = math.radians(t["elevation"]), math.radians(t["azimuth"])

    sun = bpy.data.objects["sun"]
    sun.rotation_euler = (math.pi / 2 - elev, 0.0, azim + math.pi / 2)
    sun.data.energy = t["sun_energy"]
    sun.data.color = t["sun_color"]

    nodes = scene.world.node_tree.nodes
    sky = next(n for n in nodes if n.bl_idname == "ShaderNodeTexSky")
    sky.sun_elevation = elev
    sky.sun_rotation = azim
    sky.sun_intensity = 1.0
    sky.air_density = t["air"]
    sky.ozone_density = t["ozone"]
    nodes["Background"].inputs["Strength"].default_value = t["sky_strength"]

    scene.view_settings.exposure = t["exposure"]

    for mat_name, key in (("window", "windows"), ("lantern", "lanterns")):
        mat = bpy.data.materials.get(mat_name)
        if mat is not None:
            mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = t[key]
