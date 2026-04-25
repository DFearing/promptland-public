// One-off glyph optical-weight measurer. Renders each ROOM_TYPE_VISUALS
// glyph to a canvas at a reference font-size, finds the ink bounding box,
// and reports a glyphScale + glyphYOffset value that normalises every
// glyph to the same optical box height and ink center. Intended to be run
// ad-hoc with `node tools/measure-glyphs.mjs` and the printed values
// copied into src/areas/roomTypes.ts.
//
// Measures against the shipped Cascadia Mono (public/fonts) — the same
// TTF the browser loads — so these numbers match what the player sees.

import { createCanvas, registerFont } from 'canvas'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const FONT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'fonts',
  'CascadiaMono-Regular.ttf',
)
registerFont(FONT_PATH, { family: 'Mono' })

const FONT_SIZE = 200  // big enough to get precise pixel coverage
const CANVAS = 400     // padded both sides

const glyphs = [
  { id: 'you', glyph: '@' },
  { id: 'safe', glyph: '⌂' },
  { id: 'corridor', glyph: '·' },
  { id: 'chamber', glyph: '□' },
  { id: 'crypt', glyph: '✝' },
  { id: 'storage', glyph: '▣' },
  { id: 'inn', glyph: 'I' },
  { id: 'water', glyph: '≈' },
  { id: 'portal', glyph: '◉' },
  { id: 'entrance', glyph: '▼' },
  { id: 'shop', glyph: '$' },
  { id: 'shrine', glyph: '☆' },
]

function inkBBox(glyph) {
  const canvas = createCanvas(CANVAS, CANVAS)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, CANVAS, CANVAS)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `${FONT_SIZE}px Mono`
  ctx.fillText(glyph, CANVAS / 2, CANVAS / 2)
  const { data } = ctx.getImageData(0, 0, CANVAS, CANVAS)
  let minX = CANVAS, minY = CANVAS, maxX = -1, maxY = -1
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4
      // Any pixel darker than near-white counts as ink.
      if (data[i] < 200) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { w: 0, h: 0, cy: 0 }
  // Ink vertical center, relative to the canvas center (where we drew
  // with textBaseline: middle). Positive = ink lives below center;
  // negative = above. Expressed as a fraction of the rendered font size
  // so it's font-size-agnostic.
  const inkCenterY = (minY + maxY) / 2
  const cy = (inkCenterY - CANVAS / 2) / FONT_SIZE
  return { w: maxX - minX + 1, h: maxY - minY + 1, cy }
}

const measured = glyphs.map((g) => {
  const { w, h, cy } = inkBBox(g.glyph)
  // Geometric mean of width and height captures "visual size" better than
  // max(w, h), which treats an ink-light character with a descender (like
  // `$`) as huge and pumps every other glyph up to match.
  const size = w > 0 && h > 0 ? Math.sqrt(w * h) : 0
  return { ...g, w, h, cy, size }
})

// Target = median size, so the scale nudges outliers in both directions
// toward the crowd rather than chasing the tallest glyph.
const sorted = [...measured].map((m) => m.size).sort((a, b) => a - b)
const target = sorted[Math.floor(sorted.length / 2)]

console.log(
  'glyph'.padEnd(14),
  'w'.padStart(5),
  'h'.padStart(5),
  'size'.padStart(7),
  'scale'.padStart(7),
  'yOffset (em)',
)
for (const m of measured) {
  // Clamp scales into [0.7, 2.5]. Letting the range dip below 1.0 lets
  // naturally-big glyphs (shrine ☆) shrink back to the median; the
  // upper cap keeps tiny ones (corridor ·) from ballooning past 2.5×.
  const raw = target / (m.size || target)
  const scale = Math.max(0.7, Math.min(2.5, raw))
  const rounded = Math.round(scale * 20) / 20  // 0.05 step
  // yOffset is a CSS translateY to apply (as a fraction of the rendered
  // font-size, i.e. an `em`) so the ink's vertical center lines up with
  // the baseline set by its neighbours. Negative cy = ink above canvas
  // center; compensate by translating down by +cy ems (positive).
  const yOffset = -m.cy
  const yRounded = Math.round(yOffset * 100) / 100
  console.log(
    `${m.id} ${m.glyph}`.padEnd(14),
    String(m.w).padStart(5),
    String(m.h).padStart(5),
    m.size.toFixed(1).padStart(7),
    (rounded === 1 ? '1.00' : `${rounded.toFixed(2)}`).padStart(7),
    Math.abs(yRounded) < 0.01 ? '0' : `${yRounded > 0 ? '+' : ''}${yRounded}em`,
  )
}
