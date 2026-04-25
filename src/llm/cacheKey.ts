export interface CacheKeyInputs {
  manifestVersion: string
  templateId: string
  templateVersion: string
  worldId: string
  params: unknown
}

// Sort object keys recursively so two logically equal params produce the same string.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

// FNV-1a 64-bit. Not cryptographic, but deterministic, dependency-free, and
// works in any browser context. crypto.subtle is gated on secure contexts
// (https/localhost only), which rules out LAN-IP dev. For a content cache
// keyed by template inputs, 64 bits is ample collision resistance.
function fnv1a64Hex(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash ^ BigInt(bytes[i])) * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

// Format: "<templateId>:<worldId>:<hex>" so deletions can prefix-scan by
// (template, world) without scanning unrelated entries.
export function deriveCacheKey(inputs: CacheKeyInputs): string {
  const body = stableStringify({
    m: inputs.manifestVersion,
    t: inputs.templateId,
    v: inputs.templateVersion,
    w: inputs.worldId,
    p: inputs.params,
  })
  const hex = fnv1a64Hex(new TextEncoder().encode(body))
  return `${inputs.templateId}:${inputs.worldId}:${hex}`
}
