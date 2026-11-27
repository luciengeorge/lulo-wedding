/**
 * Draws the cloud. One set of points, one draw call; the vertex shader places
 * each point between the two flat pictures the story is between, and then
 * between the last of those and its place on the slope, carries the chairs
 * round their cables and keeps the guests dancing.
 *
 * Loaded on its own, after the page: this is the only file that needs three.js.
 */
import {
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

import type { Moment } from "./timeline";

import { FLAT } from "./timeline";
import { FX, MODE, type World } from "./world";

const VERTEX = /* glsl */ `
  // A point's place in the picture the story is leaving and in the one it is
  // making: x and y from the middle of the stage in pixels, and the size of
  // its dot there (none: it waits unseen). With each, its colour there.
  attribute vec3 aFrom;
  attribute vec4 aFromInk;
  attribute vec3 aTo;
  attribute vec4 aToInk;
  attribute vec4 aDay;
  attribute vec4 aNight;
  attribute vec4 aLook;
  attribute vec4 aMove;

  uniform float uTime, uTurn, uMorph, uNight, uSwap, uRatio, uMetres, uLens;
  uniform vec3 uFlatAt;
  uniform vec3 uLiftA[2];
  uniform vec3 uLiftB[2];
  uniform vec2 uLift[2];

  varying vec4 vColor;
  varying float vSoft;

  const float PI = 3.14159265;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  // A chair or a tow, drawn about its grip, carried round the loop: up one
  // side, round the top wheel, down the other, round the bottom one.
  vec3 ride(vec3 local, float lift, float place) {
    int i = int(lift + 0.5);
    vec3 a = uLiftA[i];
    vec3 b = uLiftB[i];
    float gauge = uLift[i].x;
    vec3 d = b - a;
    float len = length(d);
    vec3 dir = d / len;
    vec2 h = normalize(d.xz);
    vec3 fwd = vec3(h.x, 0.0, h.y);
    vec3 side = vec3(-h.y, 0.0, h.x);
    float turn = PI * gauge;
    float s = fract(place + uTime * uLift[i].y) * (2.0 * len + 2.0 * turn);
    vec3 c;
    float ang;
    if (s < len) {
      c = a + dir * s + side * gauge;
      ang = 0.0;
    } else if (s < len + turn) {
      ang = (s - len) / gauge;
      c = b + fwd * (gauge * sin(ang)) + side * (gauge * cos(ang));
    } else if (s < 2.0 * len + turn) {
      c = b - dir * (s - len - turn) - side * gauge;
      ang = PI;
    } else {
      ang = PI + (s - 2.0 * len - turn) / gauge;
      c = a + fwd * (gauge * sin(ang)) + side * (gauge * cos(ang));
    }
    vec3 heading = fwd * cos(ang) - side * sin(ang);
    vec3 across = side * cos(ang) + fwd * sin(ang);
    // It swings a little on its hanger.
    float swing = sin(uTime * 1.1 + place * 40.0) * 0.035 * local.y;
    return c + across * (local.x + swing) + vec3(0.0, local.y, 0.0) + heading * local.z;
  }

  // On the beat: a twist about the feet, a lean, a bounce at the knees, and the arms.
  vec3 dance(vec3 p, vec4 mv) {
    float beat = uTime * 5.9;
    float h = max(p.y - ${(0.22).toFixed(2)}, 0.0);
    vec2 o = p.xz - mv.xy;
    float a = sin(beat + mv.z) * 0.2;
    o = mat2(cos(a), -sin(a), sin(a), cos(a)) * o;
    float lean = sin(beat + mv.z * 1.7) * 0.06 * h;
    vec3 q = vec3(mv.x + o.x + lean * cos(mv.z), p.y, mv.y + o.y + lean * sin(mv.z));
    q.y += abs(sin(beat + mv.z)) * 0.08 * smoothstep(0.0, 0.5, h);
    q += vec3(sin(beat * 2.0 + mv.z * 3.0) * 0.13, cos(beat * 2.0 + mv.z * 2.0) * 0.11, cos(beat + mv.z) * 0.09) * mv.w;
    return q;
  }

  // The couple turn together, slowly.
  vec3 waltz(vec3 p, vec4 mv) {
    float a = uTime * 0.42;
    vec2 o = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p.xz - mv.xy);
    float h = max(p.y - ${(0.22).toFixed(2)}, 0.0);
    float sway = sin(uTime * 1.6 + mv.z) * 0.025 * h;
    return vec3(mv.x + o.x + sway, p.y + sin(uTime * 3.2) * 0.012 * h, mv.y + o.y);
  }

  void main() {
    float fx = aLook.y;
    float rand = aLook.z;
    float mode = aLook.w;

    vec3 world = position;
    if (mode > ${(MODE.couple - 0.5).toFixed(1)}) world = waltz(position, aMove);
    else if (mode > ${(MODE.dancer - 0.5).toFixed(1)}) world = dance(position, aMove);
    else if (mode > ${(MODE.rider - 0.5).toFixed(1)}) world = ride(position, aMove.x, aMove.y);

    float own = hash(rand * 91.7);
    // From one picture to the next each point crosses in its own time, in a loose arc.
    float over = smoothstep(0.0, 1.0, clamp(uTurn * 1.5 - hash(rand * 57.3) * 0.5, 0.0, 1.0));
    float aloft = over * (1.0 - over) * 4.0;
    vec2 arc = vec2(sin(own * 40.0 + uTime * 0.5), cos(own * 23.0 + uTime * 0.4)) * aloft * 22.0;
    float seenFrom = step(0.001, aFrom.z);
    float seenTo = step(0.001, aTo.z);
    vec4 ink = vec4(
      mix(aFromInk.rgb, aToInk.rgb, seenFrom < 0.5 ? 1.0 : seenTo < 0.5 ? 0.0 : over),
      mix(aFromInk.a * seenFrom, aToInk.a * seenTo, over)
    );
    // A dot in flight is a little bigger than one at rest, or the crossing would be too faint to see.
    float dotSize = mix(aFrom.z, aTo.z, over) * (1.0 + aloft * 0.9);
    vec3 flat_ = uFlatAt + vec3((mix(aFrom.xy, aTo.xy, over) + arc) * uMetres, sin(own * 61.0) * aloft * 3.0);

    // Each point leaves the last picture for the place in its own time too, and drifts wide on the way.
    float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.45 - own * 0.45, 0.0, 1.0));
    vec3 p = mix(flat_, world, m);
    p += vec3(sin(own * 40.0 + uTime * 0.6), cos(own * 23.0 + uTime * 0.4) * 0.6, sin(own * 61.0)) * m * (1.0 - m) * 7.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;

    // Dusk comes to each point in its own time too, like lights coming on.
    float n = smoothstep(0.0, 1.0, clamp(uNight * 1.6 - hash(rand * 13.3) * 0.6, 0.0, 1.0));
    vec4 c = mix(aDay, aNight, n);
    if (fx > ${(FX.flame - 0.5).toFixed(1)}) c.a *= 0.8 + 0.2 * sin(uTime * 9.0 + rand * 50.0);
    else if (fx > ${(FX.bulb - 0.5).toFixed(1)}) c.a *= 0.9 + 0.1 * sin(uTime * 2.3 + rand * 70.0);
    else if (fx > ${(FX.star - 0.5).toFixed(1)}) c.a *= 0.6 + 0.4 * sin(uTime * 1.4 + rand * 90.0);
    // The far slope sits back, as it would in haze.
    if (dist < 240.0) c.a *= mix(1.0, 0.55, smoothstep(70.0, 190.0, dist));

    // In a picture a point is a dot the size of the pixel it stands for, or it is not there yet.
    vColor = mix(vec4(ink.rgb, ink.a * uSwap), c, m);

    float lit = fx > ${(FX.bulb - 0.5).toFixed(1)} ? 1.0 : 0.0;
    float size = clamp(0.027 * aLook.x * uLens / dist, 1.0, 5.0 * aLook.x) * (1.0 + lit * n * 1.6);
    size = mix(dotSize, size, m);
    vSoft = lit * n;
    gl_PointSize = size * uRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  varying float vSoft;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    // A lit bulb glows out from its middle; everything else is a plain dot.
    float a = vColor.a * mix(1.0, exp(-d * 16.0), vSoft);
    if (a < 0.04) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

/** One of the story's flat pictures as the cloud draws it: each point's place and dot size, and its colour. */
export type Picture = { flat: Float32Array; ink: Uint8Array };

export type StoryScene = {
  /** The film's pictures, in its order, the hero's sketch first. Set again when the page changes size. */
  setPictures(pictures: readonly Picture[], metresPerPixel: number): void;
  resize(width: number, height: number): void;
  /** `ink` is how much of the flat drawing shows, 0 to 1: the dots standing in for the hero's sketch. */
  render(moment: Moment, seconds: number, ink: number): void;
  /** Draws fewer pixels, for a device that is not keeping up. False once there is nothing left to give. */
  ease(): boolean;
  dispose(): void;
};

/** `context` is the canvas's own, already got by story.tsx, which is how it knows the device can draw this at all. */
export function createScene(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, world: World): StoryScene {
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  let ratio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(ratio);
  renderer.setClearColor(0x000000, 0);

  const geometry = new BufferGeometry();
  // One pair of buffers to a picture. Which two the shader reads from follows the film.
  let pictures: { flat: BufferAttribute; ink: BufferAttribute }[] = [];
  const blank = {
    flat: new BufferAttribute(new Float32Array(world.count * 3), 3),
    ink: new BufferAttribute(new Uint8Array(world.count * 4), 4, true),
  };
  let from = -1;
  let to = -1;
  const show = (nextFrom: number, nextTo: number) => {
    if (nextFrom !== from) {
      const picture = pictures[(from = nextFrom)] ?? blank;
      geometry.setAttribute("aFrom", picture.flat);
      geometry.setAttribute("aFromInk", picture.ink);
    }
    if (nextTo !== to) {
      const picture = pictures[(to = nextTo)] ?? blank;
      geometry.setAttribute("aTo", picture.flat);
      geometry.setAttribute("aToInk", picture.ink);
    }
  };
  geometry.setAttribute("position", new BufferAttribute(world.position, 3));
  show(0, 0);
  geometry.setAttribute("aDay", new BufferAttribute(world.day, 4, true));
  geometry.setAttribute("aNight", new BufferAttribute(world.night, 4, true));
  geometry.setAttribute("aLook", new BufferAttribute(world.look, 4));
  geometry.setAttribute("aMove", new BufferAttribute(world.move, 4));

  const uniforms = {
    uTime: { value: 0 },
    uTurn: { value: 0 },
    uMorph: { value: 0 },
    uNight: { value: 0 },
    uSwap: { value: 0 },
    uRatio: { value: ratio },
    uMetres: { value: 1 },
    uLens: { value: 1 },
    uFlatAt: { value: new Vector3(...FLAT.target) },
    uLiftA: { value: world.lifts.map((lift) => new Vector3(...lift.a)) },
    uLiftB: { value: world.lifts.map((lift) => new Vector3(...lift.b)) },
    uLift: { value: world.lifts.map((lift) => new Vector2(lift.gauge, lift.speed)) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Each dot hides what is behind it, so a guest in front of the DJ reads as in front.
    depthWrite: true,
    depthTest: true,
  });
  const points = new Points(geometry, material);
  // The shader moves every point; the box three.js would cull by is not where they are.
  points.frustumCulled = false;
  const scene = new Scene();
  scene.add(points);
  const camera = new PerspectiveCamera(36, 1, 0.5, 900);
  let width = 1;
  let height = 1;

  return {
    setPictures(next, metresPerPixel) {
      pictures = next.map((picture, i) => {
        const had = pictures[i];
        if (!had) return { flat: new BufferAttribute(picture.flat, 3), ink: new BufferAttribute(picture.ink, 4, true) };
        (had.flat.array as Float32Array).set(picture.flat);
        (had.ink.array as Uint8Array).set(picture.ink);
        had.flat.needsUpdate = true;
        had.ink.needsUpdate = true;
        return had;
      });
      const [wasFrom, wasTo] = [from, to];
      from = to = -1;
      show(Math.max(0, wasFrom), Math.max(0, wasTo));
      uniforms.uMetres.value = metresPerPixel;
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
    },
    render(moment, seconds, ink) {
      const { position, target, fov } = moment.camera;
      camera.fov = fov;
      camera.setViewOffset(width, height, 0, moment.lift * height, width, height);
      camera.position.set(...position);
      camera.lookAt(...target);
      show(moment.from, moment.to);
      uniforms.uTime.value = seconds;
      uniforms.uTurn.value = moment.turn;
      uniforms.uMorph.value = moment.morph;
      uniforms.uNight.value = moment.night;
      uniforms.uSwap.value = ink;
      // Pixels per metre at one metre away, so a dot keeps its size on the ground.
      uniforms.uLens.value = height / (2 * Math.tan((fov * Math.PI) / 360));
      renderer.render(scene, camera);
    },
    ease() {
      if (ratio <= 1) return false;
      ratio = Math.max(1, ratio - 0.5);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      uniforms.uRatio.value = ratio;
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
