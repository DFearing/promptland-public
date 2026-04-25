// crypto.randomUUID requires a secure context (HTTPS or localhost). On LAN/Tailscale
// HTTP origins it's undefined, so we fall back to a v4 built from getRandomValues,
// which is available everywhere.
export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h: string[] = []
  for (let i = 0; i < 16; i++) h.push(bytes[i].toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}
