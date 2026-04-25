import { useEffect, useRef } from 'react'
import { Application, Graphics, type Filter } from 'pixi.js'
import { CRTFilter, GlowFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters'
import type { GameState } from '../game'
import type { EffectEvent } from '../effects'

interface Props {
  stateKind: GameState['kind']
  events: EffectEvent[]
  filtersEnabled: boolean
}

interface Pulse {
  start: number
  duration: number
  update: (t: number) => void
  done?: () => void
}

function readCssColor(varName: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  if (!value) return fallback
  const hex = value.startsWith('#') ? value.slice(1) : value
  const parsed = parseInt(hex, 16)
  return Number.isFinite(parsed) ? parsed : fallback
}

interface ViewportApi {
  handlePulse: (kind: EffectEvent['kind']) => void
  syncAmbient: () => void
}

export default function CharacterViewport({ stateKind, events, filtersEnabled }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ stateKind, filtersEnabled })
  const seenRef = useRef<Set<string>>(new Set())
  const apiRef = useRef<ViewportApi | null>(null)

  useEffect(() => {
    propsRef.current = { stateKind, filtersEnabled }
  }, [stateKind, filtersEnabled])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const app = new Application()
    let cancelled = false
    let cleanup: (() => void) | null = null

    const init = async () => {
      const bg = readCssColor('--bg-inset', 0x030504)
      const sprite = readCssColor('--fg-1', 0xa8ffb0)
      await app.init({
        resizeTo: host,
        background: bg,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      if (cancelled) {
        app.destroy(true, { children: true, texture: true })
        return
      }
      host.appendChild(app.canvas)

      const figure = new Graphics()
        .rect(-12, -20, 24, 40)
        .fill(sprite)
        .circle(0, -28, 8)
        .fill(sprite)
      app.stage.addChild(figure)

      // Filters live for the lifetime of the app; we mutate their parameters.
      const shockwave = new ShockwaveFilter({
        amplitude: 0,
        wavelength: 80,
        speed: 600,
        brightness: 1,
        time: 999,
      })
      const glow = new GlowFilter({
        distance: 14,
        outerStrength: 0,
        innerStrength: 0,
        color: 0xffffff,
        quality: 0.2,
      })
      const rgb = new RGBSplitFilter({
        red: { x: 0, y: 0 },
        green: { x: 0, y: 0 },
        blue: { x: 0, y: 0 },
      })
      const crt = new CRTFilter({
        curvature: 0.6,
        lineWidth: 1,
        lineContrast: 0.18,
        noise: 0.05,
        vignetting: 0.4,
        vignettingAlpha: 0.5,
        vignettingBlur: 0.4,
      })

      const allFilters: Filter[] = [rgb, shockwave, glow, crt]
      const applyFilters = () => {
        app.stage.filters = propsRef.current.filtersEnabled ? allFilters : []
      }
      applyFilters()

      const ambient = { rgb: 0, crtLine: 0.18 }
      const targetAmbient = () => {
        const sk = propsRef.current.stateKind
        return {
          rgb: sk === 'fighting' ? 1 : 0,
          crtLine: sk === 'fighting' ? 0.35 : 0.18,
        }
      }
      let target = targetAmbient()

      const pulses: Pulse[] = []

      const handlePulse: ViewportApi['handlePulse'] = (kind) => {
        if (!propsRef.current.filtersEnabled) return
        if (kind === 'damage-taken') {
          shockwave.center = { x: figure.x, y: figure.y }
          pulses.push({
            start: performance.now(),
            duration: 700,
            update: (t) => {
              shockwave.amplitude = 24 * (1 - t)
              shockwave.time = t * 0.7
            },
            done: () => {
              shockwave.amplitude = 0
              shockwave.time = 999
            },
          })
        } else if (kind === 'level-up') {
          glow.color = readCssColor('--accent-hot', 0xffd27a)
          pulses.push({
            start: performance.now(),
            duration: 1200,
            update: (t) => {
              const env = Math.sin(t * Math.PI)
              glow.outerStrength = 6 * env
              glow.innerStrength = 1.5 * env
            },
            done: () => {
              glow.outerStrength = 0
              glow.innerStrength = 0
            },
          })
        }
      }

      apiRef.current = {
        handlePulse,
        syncAmbient: () => {
          target = targetAmbient()
          applyFilters()
        },
      }

      const recenter = () => {
        figure.x = app.renderer.width / (2 * app.renderer.resolution)
        figure.y = app.renderer.height / (2 * app.renderer.resolution) + 16
      }
      recenter()
      const observer = new ResizeObserver(recenter)
      observer.observe(host)

      app.ticker.add((ticker) => {
        figure.y += Math.sin(ticker.lastTime / 400) * 0.15

        const lerp = (a: number, b: number, k = 0.08) => a + (b - a) * k
        ambient.rgb = lerp(ambient.rgb, target.rgb)
        ambient.crtLine = lerp(ambient.crtLine, target.crtLine)
        rgb.red = { x: -2 * ambient.rgb, y: 0 }
        rgb.green = { x: 0, y: 1.5 * ambient.rgb }
        rgb.blue = { x: 1.5 * ambient.rgb, y: 0 }
        crt.lineContrast = ambient.crtLine
        crt.time = ticker.lastTime / 80

        const now = performance.now()
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i]
          const t = Math.min(1, (now - p.start) / p.duration)
          p.update(t)
          if (t >= 1) {
            p.done?.()
            pulses.splice(i, 1)
          }
        }
      })

      cleanup = () => {
        observer.disconnect()
        apiRef.current = null
        app.destroy(true, { children: true, texture: true })
      }
    }

    init()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    apiRef.current?.syncAmbient()
  }, [stateKind, filtersEnabled])

  useEffect(() => {
    const fresh = events.filter((e) => !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)
    if (!apiRef.current) return
    for (const e of fresh) apiRef.current.handlePulse(e.kind)
  }, [events])

  return (
    <div className="viewport scanlines">
      <div ref={hostRef} className="viewport__canvas" />

      <style>{`
        .viewport { position: relative; height: 100%; min-height: 0; background: radial-gradient(ellipse at center, var(--bg-1) 0%, var(--bg-0) 100%); border: 1px solid var(--line-2); overflow: hidden; }
        .viewport__canvas { position: absolute; inset: 0; }
      `}</style>
    </div>
  )
}
