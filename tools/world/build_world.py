"""Build the diorama and save it. Run under Blender:

    pnpm world:build              writes tools/world/out/world.blend
    pnpm world:preview            also renders a quick overview to out/preview.png

Everything here is deterministic. Tune the world by editing the modules, never
the .blend.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from scene import buildings, cameras, common, flora, lighting, places, sea, terrain  # noqa: E402


def build(time_of_day="afternoon"):
    common.reset_scene()
    ground = common.collection("Ground")
    terrain.build(ground)
    sea.build(common.collection("Sea"))
    counts = flora.build(common.collection("Flora"))
    for kind, n in sorted(counts.items()):
        print(f"FLORA {kind} {n}")
    print(f"HOUSES {buildings.build(common.collection('Built'))}")
    places.build(common.collection("Places"))
    cameras.add_camera("overview", cameras.SHOTS["overview"])
    bpy.context.scene.camera = bpy.data.objects["overview"]
    lighting.setup(bpy.context.scene)
    lighting.setup_compositor(bpy.context.scene)
    lighting.set_time(bpy.context.scene, time_of_day)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--time", default="afternoon", choices=sorted(lighting.TIMES))
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    started = time.time()
    build(args.time)
    print(f"BUILD_S {time.time() - started:.1f}")
    print(f"OBJECTS {len(bpy.data.objects)}")

    blend = os.path.join(args.out, "world.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print(f"SAVED {blend}")

    if args.preview:
        scene = bpy.context.scene
        cameras.configure_render(scene, 640, 360, 32)
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = os.path.join(args.out, "preview.png")
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"RENDER_S {time.time() - started:.1f}")
        print(f"LUMINANCE {cameras.mean_luminance(scene.render.filepath):.3f}")


if __name__ == "__main__":
    main()
