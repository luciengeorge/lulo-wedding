"""Authored shots and render settings. Every still in the spec is a named shot
here, so the same framing is reproducible and later reusable in the web camera."""

import bpy
from mathutils import Vector

from lib import heightmap as hm
from lib import layout

from . import common

# location, target, focal length mm, f-stop. Portrait shots set sensor_fit VERTICAL.
# Place shots are anchored to the place position and its ground height, so
# moving a place moves its camera with it. Small f-stops give the shallow depth
# of field of a photographed miniature.


def _place_shot(pid, dx, dy, dz, tz, focal, fstop=1.2):
    px, py = layout.PLACES[pid]["pos"]
    pz = hm.height(px, py)
    return {"loc": (px + dx, py + dy, pz + dz), "target": (px, py, pz + tz), "focal": focal, "fstop": fstop}


SHOTS = {
    "overview": {"loc": (-15.5, -23.0, 7.2), "target": (0.8, 1.6, 2.2), "focal": 35, "fstop": 2.0},
    "overview_portrait": {"loc": (-17.5, -25.5, 8.5), "target": (0.8, 1.8, 2.4), "focal": 35, "fstop": 2.0, "portrait": True},
    "shore": _place_shot("shore", -2.6, -4.0, 1.9, 0.4, 40),
    "hill": _place_shot("hill", 1.2, -4.2, 2.3, 0.5, 40, fstop=2.8),
    "garden": _place_shot("garden", -2.4, -3.4, 3.0, 0.2, 40),
    "post": _place_shot("post", 0.6, -2.4, 2.6, 0.4, 40),
    "harbour": _place_shot("harbour", 2.7, -3.5, 1.7, 0.2, 50),
    "beirut": {"loc": (-9.5, -12.5, 3.2), "target": (-4.8, -5.8, 0.6), "focal": 45, "fstop": 1.2},
}


def add_camera(name, shot):
    cam_data = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = shot["loc"]
    common.look_at(cam, shot["target"])
    cam_data.lens = shot["focal"]
    cam_data.sensor_fit = "VERTICAL" if shot.get("portrait") else "HORIZONTAL"
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = (Vector(shot["loc"]) - Vector(shot["target"])).length
    cam_data.dof.aperture_fstop = shot["fstop"]
    return cam


def configure_render(scene, width, height, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.render.film_transparent = True


def mean_luminance(path):
    """Rough exposure gauge over a rendered file, sampled every 16th pixel."""
    img = bpy.data.images.load(path)
    px = img.pixels[:]
    total, count = 0.0, 0
    for i in range(0, len(px), 64):
        total += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
        count += 1
    bpy.data.images.remove(img)
    return total / count
