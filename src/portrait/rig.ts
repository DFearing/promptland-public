// Rig spec — locks open decisions #4 (z-order + edge cases) and #5 (canvas,
// anchor, per-slot bounding boxes) from issue #75.
//
// The rig is the shared coordinate system every cached sprite layer is
// drawn in. ComfyUI generates each layer at `CANVAS_PX × CANVAS_PX` with
// the figure standing on the rig's anchor; PixiJS composites those layers
// straight into a portrait container without per-item alignment math.
// Because the rig is a contract between generator and renderer, changing
// any constant here invalidates every cached layer that was generated
// against the old values — bump `RIG_VERSION` when that happens so old
// IndexedDB entries are skipped instead of mis-rendered.

import type { PortraitSlot } from './descriptor'

/** Bumps when any constant in this file changes in a way that would
 *  mis-align previously-cached layers. Stored alongside cache entries
 *  so a rig revision prunes the old layers automatically. */
export const RIG_VERSION = 1

/** Generation canvas — the size ComfyUI produces. 512×512 is the smallest
 *  Flux-Schnell-friendly square (64-px increments) that comfortably fits
 *  a head-to-foot humanoid with negative space for cape billow and weapon
 *  reach. Square because the bridge generates square images today; the
 *  *display* canvas crops to portrait. */
export const CANVAS_PX = 512

/** Display canvas — the central portrait column shown in PixiJS. Crops
 *  64px off each side of the 512² generation canvas so weapons and capes
 *  bleed off the edge instead of getting cut by the panel border. */
export const DISPLAY_PX = { width: 384, height: 512 } as const

/** Hip-center anchor in generation-canvas pixels. Every per-slot bbox
 *  below is sized around this point: head goes up, feet go down, weapons
 *  flank left/right. ControlNet templates (when the bridge gains
 *  controlnet support, see issue #75) will use the same anchor so a
 *  generated chest plate lands on the same hip every time. */
export const ANCHOR_PX = { x: 256, y: 320 } as const

/** Back-to-front layer order. Render iterates this array and skips
 *  empty slots — i.e. an absent `cape` doesn't shift the order, the
 *  next layer just draws over the body underneath.
 *
 *  Edge-case rules baked in:
 *
 *    - 2H weapon: `offhand` is empty by Equipped's invariant
 *      (character/types.ts:53-57), so the offhand layer naturally drops
 *      out and the mainhand sprite occupies both grip points. No special
 *      casing here.
 *
 *    - Hood vs. helm: same `head` slot, mutually exclusive at the
 *      Equipped level — only one head item can be worn, so the rig
 *      doesn't need to disambiguate.
 *
 *    - Cape clasp on the front: drawn as part of the `armor` layer's
 *      silhouette (the chest piece's prompt includes the visible clasp);
 *      the cape layer is purely the back drape. This avoids a
 *      cape-front-vs-back ordering puzzle.
 *
 *    - Mount / familiar: out of scope for v1. When added, prepend a
 *      `mount` layer at index 0 and a `familiar` layer at the end of
 *      the array (front-most). */
export const Z_ORDER: readonly PortraitSlot[] = [
  'cape',       // back drape — behind everything
  'body-base',  // species/skin silhouette
  'legs',       // pants under torso plate
  'feet',       // over leg cuffs
  'armor',      // torso plate over body + leg waistband
  'arms',       // bracers / sleeves over torso sleeve
  'offhand',    // off-hand weapon / shield
  'hands',      // gloves drawn over the offhand grip
  'mainhand',   // front-most weapon
  'head',       // helm / hood over the face
] as const

/** Rectangle in generation-canvas pixels (`[x0, y0, x1, y1]`).
 *  Inclusive of x0,y0 / exclusive of x1,y1, in line with DOMRect math. */
export type SlotBBox = readonly [number, number, number, number]

/** Per-slot bounding boxes — where a layer's silhouette is expected to
 *  sit on the 512² generation canvas. Two uses:
 *
 *    1. ControlNet template authoring (forward-looking — bridge doesn't
 *       support controlnet yet): each slot gets a hand-authored
 *       silhouette PNG sized to fill its bbox, fed in as a controlnet
 *       conditioning so generated layers always anchor to the same
 *       position.
 *
 *    2. Cropping / hit-testing in PixiJS: bound the `Sprite`'s frame to
 *       its bbox so layer-level filters (rarity outline, enchant glow)
 *       don't bleed across the whole 512² canvas.
 *
 *  Bboxes overlap intentionally — `armor` and `arms` share waistline,
 *  `offhand` and `hands` share the off-hand grip. The z-order resolves
 *  who wins each overlap pixel. */
export const SLOT_BBOX: Record<PortraitSlot, SlotBBox> = {
  'body-base': [160, 80, 352, 480],
  cape:        [128, 96, 384, 480],
  legs:        [192, 320, 320, 432],
  feet:        [160, 432, 352, 496],
  armor:       [160, 192, 352, 320],
  arms:        [128, 192, 384, 320],
  hands:       [96, 256, 416, 320],
  offhand:     [32, 192, 192, 416],
  mainhand:    [320, 192, 480, 416],
  head:        [192, 64, 320, 192],
}
