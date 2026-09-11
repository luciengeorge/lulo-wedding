"""Thin helpers over bpy so the scene modules read as geometry, not API."""

import math
import random

import bpy
from mathutils import Matrix, Vector

from lib import heightmap as hm
from lib import palette

_materials: dict[str, bpy.types.Material] = {}


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images, bpy.data.worlds):
        for item in list(block):
            if block is bpy.data.images and item.name in ("Render Result", "Viewer Node"):
                continue
            block.remove(item)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    _materials.clear()


def collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def move_to(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def material(name, color, roughness=0.85, emission=None, emission_strength=0.0, alpha=1.0, vertex_color=False):
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = palette.rgba(color)
    if name.startswith("paper"):
        grain = nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 180.0
        grain.inputs["Detail"].default_value = 4.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.035
        mat.node_tree.links.new(grain.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = palette.rgba(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if vertex_color:
        attr = nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    _materials[name] = mat
    return mat


def mesh_object(name, verts, faces, coll, materials=(), smooth_deg=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    for mat in materials:
        if mat is not None:
            mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if smooth_deg is not None:
        smooth_by_angle(obj, smooth_deg)
    return obj


def _select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def smooth_by_angle(obj, degrees):
    _select_only([obj])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def join(objects):
    _select_only(objects)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def bake_origin(obj):
    """Fold the object's transform into its mesh so the origin sits at the world
    origin. A joined prototype keeps its first part's origin otherwise, and every
    instance of it would be placed by that part rather than by the ground."""
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)


def apply_modifiers(obj):
    _select_only([obj])
    bpy.ops.object.convert(target="MESH")


def _primitive(op, name, location, coll, mat, **kwargs):
    op(location=location, **kwargs)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def box(name, size, location, coll, mat, yaw=0.0):
    w, d, h = size
    x, y, z = location
    hw, hd = w / 2, d / 2
    verts = [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (-hw, -hd, h), (hw, -hd, h), (hw, hd, h), (-hw, hd, h)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = mesh_object(name, verts, faces, coll, [mat])
    obj.location = (x, y, z)
    obj.rotation_euler = (0, 0, yaw)
    return obj


def cylinder(name, radius, depth, location, coll, mat, segments=12):
    return _primitive(bpy.ops.mesh.primitive_cylinder_add, name, location, coll, mat, radius=radius, depth=depth, vertices=segments)


def cone(name, radius, depth, location, coll, mat, segments=8):
    return _primitive(bpy.ops.mesh.primitive_cone_add, name, location, coll, mat, radius1=radius, radius2=0.0, depth=depth, vertices=segments)


def icosphere(name, radius, location, coll, mat, subdivisions=1, scale=(1, 1, 1)):
    obj = _primitive(bpy.ops.mesh.primitive_ico_sphere_add, name, location, coll, mat, radius=radius, subdivisions=subdivisions)
    obj.scale = scale
    return obj


def instance(name, src, location, coll, scale=1.0, yaw=0.0, scale_xyz=None):
    obj = bpy.data.objects.new(name, src.data)
    coll.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0, 0, yaw)
    obj.scale = scale_xyz if scale_xyz is not None else (scale, scale, scale)
    return obj


def place_on_ground(x, y, lift=0.0):
    return (x, y, hm.height(x, y) + lift)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def lathe(name, profile, coll, mat, segments=9, seed=0):
    """Revolve a (radius, height) profile around z. The first and last rings are
    capped to a point so the result is a closed, faceted solid. `seed` jitters
    ring radii a touch so a tree is not a perfect spindle."""
    rng = random.Random(seed)
    verts, faces = [], []
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = i * math.tau / segments
            rr = r * rng.uniform(0.9, 1.1) if r > 0.001 else 0.0
            ring.append(len(verts))
            verts.append((math.cos(a) * rr, math.sin(a) * rr, z))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((lower[i], lower[j], upper[j], upper[i]))
    top = len(verts)
    verts.append((0.0, 0.0, profile[-1][1] + 0.02))
    for i in range(segments):
        faces.append((rings[-1][i], rings[-1][(i + 1) % segments], top))
    bottom = len(verts)
    verts.append((0.0, 0.0, profile[0][1] - 0.02))
    for i in range(segments):
        faces.append((rings[0][(i + 1) % segments], rings[0][i], bottom))
    return mesh_object(name, verts, faces, coll, [mat])


_saved_materials: dict[str, list] = {}


def paper_mode(on: bool):
    """The unpainted maquette. Everything becomes matte paper except water, which
    becomes glossy paper so the sea stays visible by finish rather than colour.

    Works on mesh data, not object slots: instances share a mesh, so swapping
    through objects would save the already-swapped paper for later instances and
    never restore them."""
    matte = material("paper", palette.PAPER, 0.7)
    gloss = material("paper-gloss", palette.PAPER, 0.08)
    if on:
        for mesh in bpy.data.meshes:
            if not mesh.materials:
                continue
            saved = list(mesh.materials)
            _saved_materials[mesh.name] = saved
            water = mesh.name in ("sea", "garden-water") or any(m is not None and m.name.startswith("sea") for m in saved)
            for i in range(len(mesh.materials)):
                mesh.materials[i] = gloss if water else matte
    else:
        for name, mats in _saved_materials.items():
            mesh = bpy.data.meshes.get(name)
            if mesh is None:
                continue
            for i, mat in enumerate(mats):
                mesh.materials[i] = mat
        _saved_materials.clear()
