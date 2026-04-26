// Descriptor → ComfyUI prompt compiler.
//
// The compiler is a pure function — given a descriptor and the prompt
// section of `PORTRAIT_CONFIG`, it produces the English text fed to the
// bridge's `/generate` endpoint. The output is wrapped with a
// `[rig:N]` marker so a `RIG_VERSION` bump invalidates the existing
// IndexedDB cache automatically (the existing sprite cache hashes on
// the prompt string, so the marker change cascades into a different
// cache key without touching the cache schema).

import type { SpriteDescriptor } from './descriptor'
import { PORTRAIT_CONFIG, type PortraitConfig } from './config'
import { RIG_VERSION } from './rig'

/** Compile a descriptor into the full prompt sent to the bridge. */
export function compileSpritePrompt(
  d: SpriteDescriptor,
  config: PortraitConfig['prompt'] = PORTRAIT_CONFIG.prompt,
): string {
  const material = config.materialAdjective[d.material] ?? d.material
  const form = config.formDescription[d.form] ?? d.form
  const tone = config.toneModifier[d.tone] ?? d.tone

  // The descriptor sentence is the load-bearing semantic part. The prefix
  // and suffix wrap with style cues that should apply to every layer.
  const body = `${material} ${form}, ${tone}`
  return `[rig:${RIG_VERSION}] ${config.prefix}${body}${config.suffix}`
}
