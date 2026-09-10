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

from scene import cameras, common, flora, sea, terrain  # noqa: E402


def build():
    common.reset_scene()
    ground = common.collection("Ground")
    terrain.build(ground)
    sea.build(common.collection("Sea"))
    counts = flora.build(common.collection("Flora"))
    for kind, n in sorted(counts.items()):
        print(f"FLORA {kind} {n}")
    cameras.add_camera("overview", cameras.SHOTS["overview"])
    bpy.context.scene.camera = bpy.data.objects["overview"]
    # Provisional light and sky until Task 8 replaces them.
    light_data = bpy.data.lights.new("sun", "SUN")
    light_data.energy = 3.0
    light_data.angle = 0.03
    sun = bpy.data.objects.new("sun", light_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.0, 0.6)
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.7, 0.85, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15
    bpy.context.scene.world = world


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    started = time.time()
    build()
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
