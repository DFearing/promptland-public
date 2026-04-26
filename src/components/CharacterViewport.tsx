import { useEffect, useRef } from 'react'
import { Application, Graphics, type Filter } from 'pixi.js'
import { CRTFilter, GlowFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters'
import type { Character } from '../character/types'
import type { GameState } from '../game'
import { ElementOverlay, type EffectEvent, type ElementFxEvent } from '../effects'
import type { Effects } from '../themes'
import { PORTRAIT_CONFIG, PortraitLayers } from '../portrait'

interface Props {
  stateKind: GameState['kind']
  events: EffectEvent[]
  elementEvents?: ElementFxEvent[]
  viewport: Effects['viewport']
  /** Character whose equipment drives the layered portrait. Optional —
   *  when absent (or when `PORTRAIT_CONFIG.enabled` is false), the
   *  placeholder stick figure is the only thing rendered. */
  character?: Character
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
  handleEvent: (e: EffectEvent) => void
  syncAmbient: () => void
}

export default function CharacterViewport({ stateKind, events, elementEvents, viewport, character }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ stateKind, viewport })
  const seenRef = useRef<Set<string>>(new Set())
  const primedRef = useRef(false)
  const apiRef = useRef<ViewportApi | null>(null)

  useEffect(() => {
    propsRef.current = { stateKind, viewport }
  }, [stateKind, viewport])

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
        const v = propsRef.current.viewport
        const anyOn =
          v.enabled && (v.damage || v.heal || v.levelUp || v.death || v.fightAmbient)
        app.stage.filters = anyOn ? allFilters : []
      }
      applyFilters()

      const ambient = { rgb: 0, crtLine: 0.18, deathAlpha: 0 }
      const targetAmbient = () => {
        const v = propsRef.current.viewport
        const fighting =
          propsRef.current.stateKind === 'fighting' && v.enabled && v.fightAmbient
        return {
          rgb: fighting ? 1 : 0,
          crtLine: fighting ? 0.35 : 0.18,
        }
      }
      let target = targetAmbient()

      const pulses: Pulse[] = []

      const handleEvent: ViewportApi['handleEvent'] = (e) => {
        const v = propsRef.current.viewport
        if (!v.enabled) return
        if (e.kind === 'damage-taken' && v.damage) {
          // Amplitude scales with the damage-to-maxHp ratio so weak nicks
          // barely wobble and critical hits thump the whole viewport.
          const ratio = e.maxHp > 0 ? Math.min(1, e.amount / e.maxHp) : 0.5
          const amp = 14 + Math.sqrt(Math.max(0, ratio)) * 30
          shockwave.center = { x: figure.x, y: figure.y }
          pulses.push({
            start: performance.now(),
            duration: 700,
            update: (t) => {
              shockwave.amplitude = amp * (1 - t)
              shockwave.time = t * 0.7
            },
            done: () => {
              shockwave.amplitude = 0
              shockwave.time = 999
            },
          })
        } else if (e.kind === 'heal-self' && v.heal) {
          glow.color = readCssColor('--good', 0x9bf57a)
          const ratio = e.maxHp > 0 ? Math.min(1, e.amount / e.maxHp) : 0.3
          const peak = 3 + Math.sqrt(Math.max(0, ratio)) * 6
          pulses.push({
            start: performance.now(),
            duration: 900,
            update: (t) => {
              const env = Math.sin(t * Math.PI)
              glow.outerStrength = peak * env
              glow.innerStrength = 0.8 * env
            },
            done: () => {
              glow.outerStrength = 0
              glow.innerStrength = 0
            },
          })
        } else if (e.kind === 'level-up' && v.levelUp) {
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
        } else if (e.kind === 'death' && v.death) {
          // Desaturate + dim the viewport briefly — the fullscreen death
          // banner handles the main beat; this is its canvas echo.
          pulses.push({
            start: performance.now(),
            duration: 2000,
            update: (t) => {
              // Slam in, hold, drift back.
              const up = Math.min(1, t * 4)
              const hold = t < 0.75 ? 1 : 1 - (t - 0.75) * 4
              ambient.deathAlpha = up * Math.max(0, hold)
            },
            done: () => {
              ambient.deathAlpha = 0
            },
          })
        }
      }

      apiRef.current = {
        handleEvent,
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
        // During a death pulse, darken the sprite's alpha — a quick "lights
        // out" on the character that reads as felled even without audio.
        figure.alpha = 1 - Math.min(0.85, ambient.deathAlpha * 0.85)

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
  }, [stateKind, viewport])

  useEffect(() => {
    const fresh = events.filter((e) => !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)
    // Drop the buffer on first render so we don't replay every event that
    // piled up during tab-switch or before this component mounted.
    if (!primedRef.current) {
      primedRef.current = true
      return
    }
    if (!apiRef.current) return
    for (const e of fresh) apiRef.current.handleEvent(e)
  }, [events])

  return (
    <div className="viewport">
      <div ref={hostRef} className="viewport__canvas" />
      {PORTRAIT_CONFIG.enabled && character ? <PortraitLayers character={character} /> : null}
      {elementEvents && <ElementOverlay events={elementEvents} target="character" />}

      <style>{`
        .viewport { position: relative; height: 100%; min-height: 0; background: radial-gradient(ellipse at center, var(--bg-1) 0%, var(--bg-0) 100%); border: 1px solid var(--line-2); overflow: hidden; }
        .viewport__canvas { position: absolute; inset: 0; }
      `}</style>
    </div>
  )
}
