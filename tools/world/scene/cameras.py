"""Authored shots and render settings. Every still in the spec is a named shot
here, so the same framing is reproducible and later reusable in the web camera."""

import bpy
from mathutils import Vector

from . import common

# location, target, focal length mm, f-stop. Portrait shots set sensor_fit VERTICAL.
SHOTS = {
    "overview": {"loc": (-17.0, -21.0, 12.5), "target": (0.5, 1.2, 0.6), "focal": 35, "fstop": 2.0},
    "overview_portrait": {"loc": (-19.0, -23.5, 14.0), "target": (0.5, 1.4, 0.6), "focal": 35, "fstop": 2.0, "portrait": True},
    "shore": {"loc": (-8.5, -6.5, 2.4), "target": (-5.0, -2.5, 0.4), "focal": 50, "fstop": 2.8},
    "hill": {"loc": (6.5, -2.5, 4.2), "target": (3.0, 2.5, 1.4), "focal": 55, "fstop": 2.8},
    "garden": {"loc": (-5.8, 0.2, 3.6), "target": (-2.5, 3.6, 0.5), "focal": 50, "fstop": 2.8},
    "post": {"loc": (2.6, -2.6, 1.9), "target": (0.4, 0.2, 0.35), "focal": 60, "fstop": 2.8},
    "harbour": {"loc": (10.0, -6.5, 3.2), "target": (6.0, -0.8, 0.4), "focal": 45, "fstop": 2.8},
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
    scene.render.film_transparent = False


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
