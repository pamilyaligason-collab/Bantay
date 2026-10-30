import { useEffect, useRef, useState } from 'react'
import { motionOk, useOnScreen, usePageVisible, useSafetyHash, useSosScreenOpen, webgl2Capable } from './motion'
import { useReducedMotion } from './useReducedMotion'

// Night-clear sky accent (D-99, optional). One small WebGL2 fragment shader, drawn at half resolution with the pixel ratio capped at 1.
// Never mounted: on Today in this release, on #safety*, while the SOS screen is up, under reduced motion, without WebGL2 or on a low-end phone.
// The static gradient below is the fallback and is always rendered; the canvas only fades in over it.
const VERT = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FRAG = `#version 300 es
precision mediump float;
uniform vec2 r;uniform float t;out vec4 o;
float h(vec2 s){return fract(sin(dot(s,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 s){vec2 i=floor(s),f=fract(s);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 u=gl_FragCoord.xy/r;
  float w=n(vec2(u.x*2.4+t*.05,t*.08))*.5+n(vec2(u.x*5.+t*.09,t*.05))*.25;
  float band=smoothstep(.0,.5,1.-abs(u.y-(.55+w*.35))*2.4);
  vec3 c=mix(vec3(.18,.62,.52),vec3(.42,.38,.85),u.x+w*.5);
  o=vec4(c*band*.85,band*.7);
}`

/** true on Today (empty hash or #today): Aurora stays a still gradient there in this release. */
const onToday = () => /^#?(today)?$/.test(location.hash)

export function Aurora({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const [sos, safety, seen, visible] = [useSosScreenOpen(), useSafetyHash(), useOnScreen(host), usePageVisible()]
  const [capable] = useState(() => webgl2Capable())
  const allowed = capable && !reduced && !sos && !safety && !onToday()
  const running = allowed && seen && visible
  const [live, setLive] = useState(false)
  const go = useRef(running)
  const kick = useRef<() => void>(() => undefined)
  go.current = running
  useEffect(() => { if (running) kick.current() }, [running])

  useEffect(() => {
    if (!allowed) { setLive(false); return }
    const c = cv.current
    const gl = c?.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' })
    if (!c || !gl) return
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return }
    gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const [ur, ut] = [gl.getUniformLocation(prog, 'r'), gl.getUniformLocation(prog, 't')]
    const fit = () => { const b = host.current!.getBoundingClientRect(); c.width = Math.max(1, Math.round(b.width / 2)); c.height = Math.max(1, Math.round(b.height / 2)); gl.viewport(0, 0, c.width, c.height) }
    fit()
    let raf = 0
    const t0 = performance.now()
    const frame = () => {
      raf = 0
      if (!go.current || !motionOk()) return
      gl.uniform2f(ur, c.width, c.height); gl.uniform1f(ut, (performance.now() - t0) / 1000)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    kick.current = () => { if (!raf) raf = requestAnimationFrame(frame) }
    setLive(true)
    kick.current()
    return () => { cancelAnimationFrame(raf); kick.current = () => undefined; setLive(false); gl.getExtension('WEBGL_lose_context')?.loseContext() }
  }, [allowed])

  // the canvas element exists only while allowed, so SOS, Safety and Today never have a <canvas> in the DOM
  return (
    <div ref={host} className={className ? `au ${className}` : 'au'} data-live={live || undefined} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, #0B1636, #25396F 70%, #2E5A5A)' }}>
      {allowed && <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: live ? 1 : 0, transition: 'opacity .6s' }} />}
    </div>
  )
}
