"""Render the approval stills from the spec.

    pnpm world:stills            full quality into public/world/stills/
    pnpm world:stills:preview    fast, into tools/world/out/stills/

Each still is (name, shot, time, paper). `paper` renders the unpainted maquette
by overriding every material with the paper material, which is what the gate
will show before the password.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import build_world  # noqa: E402
from lib import palette  # noqa: E402
from scene import cameras, common, lighting  # noqa: E402

STILLS = [
    ("overview-afternoon", "overview", "afternoon", False),
    ("overview-dusk", "overview", "dusk", False),
    ("overview-paper", "overview", "afternoon", True),
    ("overview-portrait", "overview_portrait", "afternoon", False),
    ("shore", "shore", "afternoon", False),
    ("hill", "hill", "dusk", False),
    ("garden", "garden", "afternoon", False),
    ("post-house", "post", "afternoon", False),
    ("harbour", "harbour", "dusk", False),
]

FULL = {"width": 1920, "height": 1080, "samples": 384}
PREVIEW = {"width": 640, "height": 360, "samples": 32}


def render(name, shot_name, time_of_day, paper, out, quality):
    scene = bpy.context.scene
    shot = cameras.SHOTS[shot_name]
    cam = bpy.data.objects.get(shot_name) or cameras.add_camera(shot_name, shot)
    scene.camera = cam
    lighting.set_time(scene, time_of_day)

    w, h = quality["width"], quality["height"]
    if shot.get("portrait"):
        w, h = h, w
    cameras.configure_render(scene, w, h, quality["samples"])
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = os.path.join(out, f"{name}.webp")

    view_layer = bpy.context.view_layer
    view_layer.material_override = common.material("paper", palette.PAPER, 0.7) if paper else None

    started = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"STILL {name} {time.time() - started:.0f}s LUMINANCE {cameras.mean_luminance(scene.render.filepath):.3f}")
    view_layer.material_override = None


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--only", default=None, help="render a single still by name")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    build_world.build("afternoon")
    quality = PREVIEW if args.preview else FULL
    for name, shot, time_of_day, paper in STILLS:
        if args.only and name != args.only:
            continue
        render(name, shot, time_of_day, paper, args.out, quality)


if __name__ == "__main__":
    main()
