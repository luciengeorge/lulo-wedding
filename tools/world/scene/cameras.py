"""Authored shots and render settings. Every still in the spec is a named shot
here, so the same framing is reproducible and later reusable in the web camera."""

import bpy
from mathutils import Vector

from lib import heightmap as hm
from lib import layout

from . import common

# location, target, focal length mm, f-stop. Portrait shots set sensor_fit VERTICAL.
# Place shots are anchored to the coastline where the place is, so moving the
# shore moves the camera with it.
_C5, _CM5 = hm.coastline(5.5), hm.coastline(-5.0)
_GX, _GY = layout.PLACES["garden"]["pos"]
_GZ = hm.height(_GX, _GY)

SHOTS = {
    "overview": {"loc": (-17.0, -21.0, 12.5), "target": (0.5, 1.2, 0.6), "focal": 35, "fstop": 2.0},
    "overview_portrait": {"loc": (-19.0, -23.5, 14.0), "target": (0.5, 1.4, 0.6), "focal": 35, "fstop": 2.0, "portrait": True},
    "shore": {"loc": (-6.9, _CM5 - 2.6, 1.6), "target": (-5.0, _CM5 + 0.55, 0.5), "focal": 45, "fstop": 5.6},
    "hill": {"loc": (4.8, -4.4, 6.4), "target": (2.4, 4.0, 1.9), "focal": 40, "fstop": 5.6},
    "garden": {"loc": (_GX - 2.4, _GY - 3.4, _GZ + 3.0), "target": (_GX, _GY, _GZ + 0.2), "focal": 40, "fstop": 5.6},
    "post": {"loc": (0.9, -2.2, 3.2), "target": (0.4, 0.25, 0.35), "focal": 40, "fstop": 5.6},
    "harbour": {"loc": (8.2, _C5 - 4.2, 1.9), "target": (5.5, _C5 - 0.7, 0.25), "focal": 50, "fstop": 5.6},
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
