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
        "sky_view": 0.55,
        "mist": 0.35,
        "haze": (0.78, 0.84, 0.88, 1.0),
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
        "sky_view": 0.45,
        "mist": 0.5,
        "haze": (0.62, 0.5, 0.48, 1.0),
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
    background = nodes["Background"]
    view = nodes.new("ShaderNodeBackground")
    view.name = "ViewBackground"
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    # Below the horizon the sky model returns black. The camera sees a strip of
    # that between the card's edge and true horizontal, so it is filled with the
    # haze colour there and reads as distant air, continuous with the haze pass.
    coord = nodes.new("ShaderNodeTexCoord")
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    horizon = nodes.new("ShaderNodeMapRange")
    horizon.name = "Horizon"
    horizon.interpolation_type = "SMOOTHSTEP"
    horizon.inputs["From Min"].default_value = -0.01
    horizon.inputs["From Max"].default_value = 0.06
    horizon.inputs["To Min"].default_value = 1.0
    horizon.inputs["To Max"].default_value = 0.0
    fill = nodes.new("ShaderNodeRGB")
    fill.name = "HorizonColour"
    blend = nodes.new("ShaderNodeMixRGB")
    blend.name = "HorizonBlend"
    links.new(coord.outputs["Generated"], xyz.inputs["Vector"])
    links.new(xyz.outputs["Z"], horizon.inputs["Value"])
    links.new(horizon.outputs["Result"], blend.inputs["Fac"])
    links.new(sky.outputs["Color"], blend.inputs["Color1"])
    links.new(fill.outputs["Color"], blend.inputs["Color2"])
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(blend.outputs["Color"], view.inputs["Color"])
    links.new(background.outputs["Background"], mix.inputs[1])
    links.new(view.outputs["Background"], mix.inputs[2])
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(mix.outputs["Shader"], nodes["World Output"].inputs["Surface"])
    scene.world = world


def setup_compositor(scene):
    """Distance haze from the Mist pass, tinted with the sky, laid over the sky
    from the Environment pass.

    The film is transparent so sky pixels carry no alpha; haze is applied only
    to the covered part of a pixel, premultiplied, and the result is alpha-over
    the environment. That is what stops a light fringe forming where dark trees
    meet bright sky. Blender 5 keeps the compositor as a node group on the scene
    with a Group Output; mix and math are the shared ShaderNode ones."""
    view_layer = scene.view_layers[0]
    view_layer.use_pass_mist = True
    view_layer.use_pass_environment = True
    scene.render.film_transparent = True
    # The overview camera sits about 28 units from the near coast and 42 from the ridge.
    scene.world.mist_settings.start = 27.0
    scene.world.mist_settings.depth = 18.0
    scene.world.mist_settings.falloff = "QUADRATIC"

    tree = bpy.data.node_groups.new("Compositor", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    layers = tree.nodes.new("CompositorNodeRLayers")
    haze = tree.nodes.new("CompositorNodeRGB")
    haze.name = "HazeColour"
    haze_prem = tree.nodes.new("ShaderNodeMixRGB")
    haze_prem.blend_type = "MULTIPLY"
    haze_prem.inputs["Factor"].default_value = 1.0
    strength = tree.nodes.new("ShaderNodeMath")
    strength.name = "HazeStrength"
    strength.operation = "MULTIPLY"
    hazed = tree.nodes.new("ShaderNodeMixRGB")
    hazed.blend_type = "MIX"
    with_alpha = tree.nodes.new("CompositorNodeSetAlpha")
    with_alpha.inputs["Type"].default_value = "Replace Alpha"
    over = tree.nodes.new("CompositorNodeAlphaOver")
    out = tree.nodes.new("NodeGroupOutput")

    tree.links.new(haze.outputs["Color"], haze_prem.inputs["Color1"])
    tree.links.new(layers.outputs["Alpha"], haze_prem.inputs["Color2"])
    tree.links.new(layers.outputs["Mist"], strength.inputs[0])
    tree.links.new(strength.outputs["Value"], hazed.inputs["Factor"])
    tree.links.new(layers.outputs["Image"], hazed.inputs["Color1"])
    tree.links.new(haze_prem.outputs["Color"], hazed.inputs["Color2"])
    tree.links.new(hazed.outputs["Color"], with_alpha.inputs["Image"])
    tree.links.new(layers.outputs["Alpha"], with_alpha.inputs["Alpha"])
    tree.links.new(layers.outputs["Environment"], over.inputs["Background"])
    tree.links.new(with_alpha.outputs["Image"], over.inputs["Foreground"])
    tree.links.new(over.outputs["Image"], out.inputs["Image"])


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
    nodes["ViewBackground"].inputs["Strength"].default_value = t["sky_view"]
    # The view background scales this by sky_view, so pre-divide to land on the same
    # haze colour the compositor uses; then the far card dissolves into the sky.
    nodes["HorizonColour"].outputs[0].default_value = tuple(c / t["sky_view"] for c in t["haze"][:3]) + (1.0,)

    scene.view_settings.exposure = t["exposure"]

    for mat_name, key, scale in (("window", "windows", 1.0), ("lantern", "lanterns", 1.0), ("glass", "windows", 0.45)):
        mat = bpy.data.materials.get(mat_name)
        if mat is not None:
            bsdf = mat.node_tree.nodes["Principled BSDF"]
            if mat_name == "glass":
                bsdf.inputs["Emission Color"].default_value = (0.85, 0.55, 0.25, 1.0)
            bsdf.inputs["Emission Strength"].default_value = t[key] * scale

    tree = scene.compositing_node_group
    if tree is not None and "HazeStrength" in tree.nodes:
        tree.nodes["HazeStrength"].inputs[1].default_value = t["mist"]
        tree.nodes["HazeColour"].outputs[0].default_value = t["haze"]
