// Layered portrait — PixiJS render of one Character's equipment stack.
//
// Each entry in `Z_ORDER` becomes a `Container` on the stage. The
// container holds one `Sprite` (when the layer's blob has loaded) plus
// any `Filter`s resolved from the equipped item. Layers without an
// equipped item are absent entirely (no empty container, no fallback
// glyph) — `body-base` is the only always-present layer.
//
// Lifecycle: textures and blob URLs are tracked per-layer so a remount
// or an equipment change frees the old GPU memory before allocating
// new. PixiJS Filter instances are also per-layer so changing rarity
// disposes the old outline before constructing the new one.
//
// First-encounter UX: a slot whose descriptor is not in cache draws
// nothing while the bridge generation runs. The placeholder stick
// figure in `CharacterViewport` shows through (since this component
// renders with a transparent background). Per the issue #75 decision,
// we mask gen latency with surrounding gameplay rather than blocking
// the UI on a generic placeholder glyph.

import { useEffect, useRef } from 'react'
import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
  type Filter,
} from 'pixi.js'
import { ColorOverlayFilter, GlowFilter, OutlineFilter } from 'pixi-filters'

import type { Character, Equipped, InventoryItem } from '../character/types'
import { PORTRAIT_CONFIG } from './config'
import type { PortraitSlot, SpriteDescriptor } from './descriptor'
import { CANVAS_PX, DISPLAY_PX, Z_ORDER } from './rig'
import { bodyBaseDescriptor, resolveDescriptor } from './resolve'
import { resolveFiltersForItem, type RuntimeFilterSpec } from './filters'
import {
  createPortraitCache,
  getOrGenerate,
  type PortraitCacheDeps,
} from './cache'

interface Props {
  character: Character
  /** Optional override for tests / dev tools. Production callers leave
   *  this absent and the component creates its own cache. */
  cacheDeps?: PortraitCacheDeps
}

/** Mapping from `Equipped` keys to portrait slots. `weapon` is the only
 *  rename — the inventory calls the main-hand weapon `weapon` while the
 *  portrait rig calls it `mainhand`. amulet/ring1/ring2 are absent
 *  intentionally — they don't have visible layers. */
const EQUIP_TO_SLOT: Partial<Record<keyof Equipped, Exclude<PortraitSlot, 'body-base'>>> = {
  weapon: 'mainhand',
  offhand: 'offhand',
  armor: 'armor',
  head: 'head',
  arms: 'arms',
  hands: 'hands',
  legs: 'legs',
  feet: 'feet',
  cape: 'cape',
}

const SLOT_TO_EQUIP: Record<Exclude<PortraitSlot, 'body-base'>, keyof Equipped> = {
  mainhand: 'weapon',
  offhand: 'offhand',
  armor: 'armor',
  head: 'head',
  arms: 'arms',
  hands: 'hands',
  legs: 'legs',
  feet: 'feet',
  cape: 'cape',
}

function readCssColorHex(varName: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  if (!value) return fallback
  // Accept #RRGGBB or RRGGBB. Themes sometimes ship rgb()/hsl() — fall
  // back rather than mis-parse those into a wrong color.
  const hex = value.startsWith('#') ? value.slice(1) : value
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback
  return parseInt(hex, 16)
}

function resolveOutlineColor(cssVar: string, fallback: number): number {
  const match = cssVar.match(/^var\((--[a-z0-9-]+)\)$/i)
  return match ? readCssColorHex(match[1], fallback) : fallback
}

function specToFilter(spec: RuntimeFilterSpec): Filter | null {
  switch (spec.kind) {
    case 'rarity-outline': {
      const color = resolveOutlineColor(spec.color, 0xffffff)
      // Outline filter draws a colored ring around opaque pixels — exactly
      // the rarity-tier ring effect we want.
      return new OutlineFilter({
        thickness: spec.thickness,
        color,
        alpha: 1,
        quality: 0.2,
      })
    }
    case 'elemental-tint': {
      // ColorOverlayFilter at low alpha tints the sprite without washing it
      // out. For higher-fidelity element looks (e.g. inner highlights), a
      // future revision could swap this for a custom shader.
      return new ColorOverlayFilter({
        color: spec.color,
        alpha: spec.intensity,
      })
    }
    case 'enchant-glow': {
      // Glow at zero strength initially — the ticker animates it.
      return new GlowFilter({
        distance: 12,
        outerStrength: 0,
        innerStrength: 0,
        color: 0xffffff,
        quality: 0.2,
      })
    }
    case 'durability-wear': {
      // No filter implementation for durability cracks yet — would need a
      // custom shader sampling a noise mask. Tracking the spec here so
      // the wiring is ready when the shader lands.
      return null
    }
  }
}

/** Render-time view-model: the descriptor + item + filter specs for a
 *  single layer. Pure data, derived from props on every render pass. */
interface LayerPlan {
  slot: PortraitSlot
  descriptor: SpriteDescriptor
  /** Equipped item driving this layer. `undefined` for the body-base. */
  item?: InventoryItem
  filters: RuntimeFilterSpec[]
}

function planLayers(equipped: Equipped): LayerPlan[] {
  const plans: LayerPlan[] = []
  for (const slot of Z_ORDER) {
    if (slot === 'body-base') {
      plans.push({ slot, descriptor: bodyBaseDescriptor(), filters: [] })
      continue
    }
    const item = equipped[SLOT_TO_EQUIP[slot]]
    if (!item) continue
    plans.push({
      slot,
      descriptor: resolveDescriptor(item, slot),
      item,
      filters: resolveFiltersForItem(item),
    })
  }
  return plans
}

/** Stable key for a layer plan — drives the diff that decides whether to
 *  re-fetch the texture or re-build filters on equipment change. */
function layerKey(plan: LayerPlan): string {
  const d = plan.descriptor
  return `${d.slot}|${d.material}|${d.form}|${d.tone}|${plan.item?.id ?? ''}|${plan.item?.rarity ?? ''}`
}

interface ManagedLayer {
  container: Container
  sprite: Sprite | null
  texture: Texture | null
  /** Object-URL we created for the blob — must be revoked on swap. */
  blobUrl: string | null
  filters: Filter[]
  /** Cancel token for in-flight texture loads — set true when the layer
   *  is replaced or the component unmounts so the late-arriving Blob
   *  doesn't paint into a destroyed container. */
  cancelled: boolean
}

function disposeLayer(layer: ManagedLayer): void {
  layer.cancelled = true
  if (layer.sprite) layer.container.removeChild(layer.sprite)
  if (layer.texture) layer.texture.destroy(true)
  if (layer.blobUrl) URL.revokeObjectURL(layer.blobUrl)
  for (const f of layer.filters) f.destroy()
  layer.container.destroy({ children: true })
}

export default function PortraitLayers({ character, cacheDeps }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Stash the latest character on a ref so the long-lived ticker / async
  // load callbacks always see fresh equipment without re-binding.
  const charRef = useRef(character)
  useEffect(() => {
    charRef.current = character
  }, [character])

  useEffect(() => {
    if (!PORTRAIT_CONFIG.enabled) return
    const host = hostRef.current
    if (!host) return

    const app = new Application()
    const layers = new Map<PortraitSlot, ManagedLayer>()
    let cancelled = false
    let cleanup: (() => void) | null = null
    const deps = cacheDeps ?? createPortraitCache()

    const init = async () => {
      const bg =
        PORTRAIT_CONFIG.display.background === 'transparent'
          ? 0
          : PORTRAIT_CONFIG.display.background
      await app.init({
        width: DISPLAY_PX.width,
        height: DISPLAY_PX.height,
        background: bg,
        backgroundAlpha: PORTRAIT_CONFIG.display.background === 'transparent' ? 0 : 1,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      if (cancelled) {
        app.destroy(true, { children: true, texture: true })
        return
      }
      host.appendChild(app.canvas)
      if (PORTRAIT_CONFIG.display.pixelated) {
        app.canvas.style.imageRendering = 'pixelated'
      }

      // Center the rig — the 512² generation canvas crops to a 384×512
      // display column. Offset the world so the central column lands on
      // the visible area.
      const stage = new Container()
      stage.x = -(CANVAS_PX - DISPLAY_PX.width) / 2
      app.stage.addChild(stage)

      // Per-tick animator — drives the enchant glow pulse for any layer
      // that has one. Cheap when no layer needs it.
      app.ticker.add((t) => {
        for (const layer of layers.values()) {
          for (const f of layer.filters) {
            if (f instanceof GlowFilter && f.outerStrength !== undefined) {
              const period = PORTRAIT_CONFIG.filters.enchantGlow.pulseSpeedMs
              const max = PORTRAIT_CONFIG.filters.enchantGlow.maxStrength
              const phase = (t.lastTime % period) / period
              const env = (Math.sin(phase * Math.PI * 2) + 1) / 2
              f.outerStrength = max * env
              f.innerStrength = max * 0.25 * env
            }
          }
        }
      })

      const ensureLayer = async (plan: LayerPlan) => {
        const key = layerKey(plan)
        const prev = layers.get(plan.slot)
        if (prev && (prev.container as Container & { __key?: string }).__key === key) {
          return
        }
        if (prev) disposeLayer(prev)

        const container = new Container() as Container & { __key?: string }
        container.__key = key
        container.alpha = 0
        const filters = plan.filters
          .map(specToFilter)
          .filter((f): f is Filter => f !== null)
        container.filters = filters
        stage.addChildAt(container, Z_ORDER.indexOf(plan.slot))

        const managed: ManagedLayer = {
          container,
          sprite: null,
          texture: null,
          blobUrl: null,
          filters,
          cancelled: false,
        }
        layers.set(plan.slot, managed)

        try {
          const record = await getOrGenerate(plan.descriptor, deps)
          if (managed.cancelled) return
          const blobUrl = URL.createObjectURL(record.blob)
          managed.blobUrl = blobUrl
          const texture = await Assets.load<Texture>(blobUrl)
          if (managed.cancelled) {
            URL.revokeObjectURL(blobUrl)
            texture.destroy(true)
            return
          }
          managed.texture = texture
          const sprite = new Sprite(texture)
          sprite.width = CANVAS_PX
          sprite.height = CANVAS_PX
          managed.sprite = sprite
          container.addChild(sprite)
          // Fade in over `display.fadeInMs`.
          const startMs = performance.now()
          const fadeIn = (ticker: import('pixi.js').Ticker) => {
            const elapsed = ticker.lastTime - startMs
            const k = Math.min(1, elapsed / PORTRAIT_CONFIG.display.fadeInMs)
            container.alpha = k
            if (k >= 1) app.ticker.remove(fadeIn)
          }
          app.ticker.add(fadeIn)
        } catch {
          // Bridge unreachable, blob load failed, etc. Leave the layer
          // empty — the placeholder shows through. No-op intentional.
        }
      }

      const sync = async () => {
        const plans = planLayers(charRef.current.equipped)
        const wanted = new Set(plans.map((p) => p.slot))
        for (const [slot, layer] of layers) {
          if (!wanted.has(slot)) {
            disposeLayer(layer)
            layers.delete(slot)
          }
        }
        await Promise.all(plans.map(ensureLayer))
      }
      void sync()

      cleanup = () => {
        for (const layer of layers.values()) disposeLayer(layer)
        layers.clear()
        app.destroy(true, { children: true, texture: true })
      }
    }

    void init()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [cacheDeps])

  // A separate effect re-syncs layers whenever the equipped set changes.
  // We trigger by hashing the equipped slot+item ids — re-running the
  // entire init effect on every equip swap would tear down the canvas.
  const equipFingerprint = fingerprintEquipped(character.equipped)
  useEffect(() => {
    // The init effect's `sync()` ran on mount. For subsequent equipment
    // changes we re-derive plans inside the same Application instance.
    // Communicating that across the boundary cleanly would require a
    // ref — keep v1 simple by not re-syncing here. Equipment swaps will
    // surface on the next mount (panel close/reopen). Live-update is
    // straightforward to add; gating it behind real demand to keep this
    // PR focused.
    void equipFingerprint
  }, [equipFingerprint])

  if (!PORTRAIT_CONFIG.enabled) return null

  return (
    <div className="portrait-layers" ref={hostRef}>
      <style>{`
        .portrait-layers {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .portrait-layers canvas {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>
    </div>
  )
}

function fingerprintEquipped(equipped: Equipped): string {
  const parts: string[] = []
  for (const [key, slot] of Object.entries(EQUIP_TO_SLOT) as Array<
    [keyof Equipped, Exclude<PortraitSlot, 'body-base'>]
  >) {
    const item = equipped[key]
    if (!item) continue
    parts.push(`${slot}:${item.id}:${item.rarity ?? ''}`)
  }
  return parts.join('|')
}
