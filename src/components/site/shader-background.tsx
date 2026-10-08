"use client"

/**
 * "Neuro Noise" filaments on one WebGL canvas that fills its parent. Adapted from the 21st.dev Shader
 * Builder export of Paper Shaders (https://shaders.paper.design/neuro-noise, Apache-2.0), trimmed to the
 * parts this site uses and recolored per theme. It pauses off-screen and in background tabs, draws a
 * single still frame when the visitor prefers reduced motion, and stays invisible if WebGL is missing,
 * so the parent's own background shows instead.
 */

import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type Rgb = readonly [number, number, number]

interface Preset {
  /** Four stops from the empty background to the brightest filament. */
  colors: readonly [Rgb, Rgb, Rgb, Rgb]
  /** How strongly the filaments glow. */
  glow: number
  grain: number
  /** Darkens the corners, 0 to 1. */
  vignette: number
}

const hex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const PRESETS: Record<"dark" | "light", Preset> = {
  dark: {
    colors: [hex("#050914"), hex("#0c1d4d"), hex("#3d6bf7"), hex("#a9c8ff")],
    glow: 0.32,
    grain: 0.035,
    vignette: 0.35,
  },
  light: {
    colors: [hex("#f6f8fc"), hex("#dfe7fd"), hex("#7b9af4"), hex("#1d3fb0")],
    glow: 0.2,
    grain: 0.012,
    vignette: 0,
  },
}

const VERTEX = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[4];
uniform vec4 u_scene;  // resolution.xy, time, seed
uniform vec4 u_shape;  // scale, intensity, glow, grain
uniform float u_vignette;

vec3 palette(float x) {
  float f = clamp(x, 0.0, 1.0) * 3.0;
  vec3 col = u_colors[0];
  col = mix(col, u_colors[1], smoothstep(0.0, 1.0, clamp(f, 0.0, 1.0)));
  col = mix(col, u_colors[2], smoothstep(0.0, 1.0, clamp(f - 1.0, 0.0, 1.0)));
  col = mix(col, u_colors[3], smoothstep(0.0, 1.0, clamp(f - 2.0, 0.0, 1.0)));
  return col;
}

// Even white noise for film grain (Dave Hoskins hash12).
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 res = u_scene.xy;
  float t = u_scene.z;
  float seed = u_scene.w;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y) * u_shape.x;

  vec2 q = p * (1.6 + u_shape.y * 2.4);
  float field = 0.0;
  float weight = 0.55;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    q += vec2(
      sin(q.y * (1.7 + fi * 0.09) + t * (0.35 + fi * 0.04) + seed),
      cos(q.x * (1.5 + fi * 0.11) - t * (0.28 + fi * 0.03))
    ) * (0.22 + u_shape.y * 0.14);
    float filaments = abs(sin(q.x + q.y + fi * 0.72));
    field += weight / (0.08 + filaments);
    weight *= 0.62;
    q = q.yx * vec2(-1.08, 1.04);
  }
  float glow = 1.0 - exp(-field * (0.018 + u_shape.z * 0.04));
  vec3 col = palette(glow);

  vec2 uv = gl_FragCoord.xy / res;
  float vd = length(uv - 0.5) * 1.41421356;
  col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  col += (grainHash(gl_FragCoord.xy + seed * 17.0) - 0.5) * u_shape.w;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

const SCALE = 1.26
const INTENSITY = 0.35
const SEED = 1
const TIME_SCALE = 0.5
/** Pixel budget for the drawing buffer; the soft filaments look the same when upscaled. */
const MAX_PIXELS = 1_400_000

/**
 * Releasing the context is deferred by a tick: React's development double mount would otherwise
 * get the same, already lost context back from the canvas.
 */
const pendingReleases = new WeakMap<HTMLCanvasElement, number>()

/** `still` draws one frame and stops, for places where motion would only distract, such as sign-in. */
export function ShaderBackground({ className, still = false }: { className?: string; still?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()
  const presetRef = useRef<Preset>(PRESETS.dark)
  const redrawRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    presetRef.current = resolvedTheme === "light" ? PRESETS.light : PRESETS.dark
    redrawRef.current()
  }, [resolvedTheme])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    window.clearTimeout(pendingReleases.get(canvas))
    pendingReleases.delete(canvas)
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    })
    if (!gl) return

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
    }
    const program = gl.createProgram()
    const vertex = compile(gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT)
    if (!vertex || !fragment) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // One oversized triangle covers the whole viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uniforms = {
      colors: gl.getUniformLocation(program, "u_colors"),
      scene: gl.getUniformLocation(program, "u_scene"),
      shape: gl.getUniformLocation(program, "u_shape"),
      vignette: gl.getUniformLocation(program, "u_vignette"),
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    // Phones get a calmer frame rate; the motion is slow enough that it reads the same.
    const minFrameMs = window.matchMedia("(pointer: coarse)").matches ? 33 : 16
    const start = performance.now()
    let raf = 0
    let lastDraw = 0
    let visible = document.visibilityState === "visible"
    let inView = true
    let disposed = false
    let shown = false

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr))
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr))
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (rawWidth * rawHeight)))
      const width = Math.max(1, Math.round(rawWidth * scale))
      const height = Math.max(1, Math.round(rawHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const draw = (now: number) => {
      const preset = presetRef.current
      const time = still || reducedMotion.matches ? 12 : ((now - start) / 1000) * TIME_SCALE
      resize()
      gl.uniform3fv(uniforms.colors, new Float32Array(preset.colors.flat()))
      gl.uniform4f(uniforms.scene, canvas.width, canvas.height, time, SEED)
      gl.uniform4f(uniforms.shape, SCALE, INTENSITY, preset.glow, preset.grain)
      gl.uniform1f(uniforms.vignette, preset.vignette)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!shown) {
        shown = true
        canvas.style.opacity = "1"
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (disposed || !visible || !inView) return
      if (now - lastDraw >= minFrameMs) {
        lastDraw = now
        draw(now)
      }
      if (!still && !reducedMotion.matches) raf = requestAnimationFrame(frame)
    }

    const request = () => {
      if (!disposed && visible && inView && raf === 0) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      raf = 0
    }
    // A still frame after a resize or theme change, even when the animation is paused for reduced motion.
    const redraw = () => {
      lastDraw = 0
      request()
    }
    redrawRef.current = redraw

    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(canvas)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true
      if (inView) request()
      else stop()
    })
    intersectionObserver.observe(canvas)
    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible"
      if (visible) request()
      else stop()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    reducedMotion.addEventListener("change", redraw)
    const onContextLost = (event: Event) => {
      event.preventDefault()
      disposed = true
      stop()
      canvas.style.opacity = "0"
    }
    canvas.addEventListener("webglcontextlost", onContextLost)

    request()
    return () => {
      disposed = true
      stop()
      redrawRef.current = () => undefined
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      reducedMotion.removeEventListener("change", redraw)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      const timer = window.setTimeout(() => {
        if (pendingReleases.get(canvas) !== timer) return
        pendingReleases.delete(canvas)
        gl.getExtension("WEBGL_lose_context")?.loseContext()
      }, 0)
      pendingReleases.set(canvas, timer)
    }
  }, [still])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none block size-full opacity-0 transition-opacity duration-1000", className)}
    />
  )
}
