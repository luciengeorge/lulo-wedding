"""A single plane at sea level. Shallow tone facing the camera, deep tone at
grazing angles, fine ripples from a noise bump. Alpha lets the sand read
through near the shore."""

import bpy

from lib import heightmap as hm
from lib import palette

from . import common


def build(coll):
    hw, hd = hm.TABLE_W / 2, hm.TABLE_D / 2
    z = hm.SEA_LEVEL
    obj = common.mesh_object("sea", [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z)], [(0, 1, 2, 3)], coll)
    mat = common.material("sea", palette.SEA_SHALLOW, roughness=0.06, alpha=0.82)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]

    facing = nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.35
    ramp = nodes.new("ShaderNodeMixRGB")
    ramp.inputs["Color1"].default_value = palette.rgba(palette.SEA_SHALLOW)
    ramp.inputs["Color2"].default_value = palette.rgba(palette.SEA_DEEP)
    links.new(facing.outputs["Facing"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    ripple = nodes.new("ShaderNodeTexNoise")
    ripple.inputs["Scale"].default_value = 38.0
    ripple.inputs["Detail"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    links.new(ripple.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    obj.data.materials.append(mat)
