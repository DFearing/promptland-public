import { useEffect, useRef, useState } from 'react'
import type { ElementFxEvent, ElementKind, ElementTarget } from './types'

interface Props {
  events: ElementFxEvent[]
  target: ElementTarget
}

interface ActiveFx {
  id: string
  element: ElementKind
}

// Duration each overlay animation runs before self-removing.
const DURATION_MS = 1200

// Short absolute-positioned overlay that layers an elemental flourish on top of
// whichever panel hosts it. Consumes a shared ElementFxEvent stream, filtered
// by target (character viewport vs. combat target panel).
export default function ElementOverlay({ events, target }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveFx[]>([])

  useEffect(() => {
    const fresh = events.filter((e) => e.target === target && !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)
    setActive((prev) => [...prev, ...fresh.map((e) => ({ id: e.id, element: e.element }))])
    const ids = fresh.map((e) => e.id)
    const t = window.setTimeout(() => {
      setActive((prev) => prev.filter((a) => !ids.includes(a.id)))
    }, DURATION_MS)
    return () => window.clearTimeout(t)
  }, [events, target])

  if (active.length === 0) return null

  return (
    <div className="fxel" aria-hidden="true">
      {active.map((fx) => (
        <div key={fx.id} className={`fxel__burst fxel__burst--${fx.element}`} />
      ))}

      <style>{`
        .fxel {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 3;
        }
        .fxel__burst {
          position: absolute;
          inset: 0;
          mix-blend-mode: screen;
          opacity: 0;
        }

        .fxel__burst--fire {
          background:
            radial-gradient(ellipse at 50% 60%, #ff9140 0%, #ff4c2f 18%, transparent 55%),
            radial-gradient(ellipse at 30% 70%, #ffb750 0%, transparent 45%),
            radial-gradient(ellipse at 70% 55%, #ff5a2a 0%, transparent 40%);
          animation: fxel-fire ${DURATION_MS}ms ease-out forwards;
        }
        @keyframes fxel-fire {
          0%   { opacity: 0; transform: scale(0.8); filter: blur(3px); }
          15%  { opacity: 0.75; transform: scale(1.05) translateY(-4px); filter: blur(0); }
          45%  { opacity: 0.65; transform: scale(1.08) translateY(-2px); }
          70%  { opacity: 0.4; }
          100% { opacity: 0; transform: scale(1.1) translateY(-6px); filter: blur(4px); }
        }

        .fxel__burst--ice {
          background:
            radial-gradient(ellipse at center, rgba(180, 230, 255, 0.7) 0%, transparent 60%),
            linear-gradient(135deg, transparent 35%, rgba(200, 240, 255, 0.35) 48%, transparent 52%),
            linear-gradient(45deg, transparent 35%, rgba(220, 240, 255, 0.25) 50%, transparent 65%);
          animation: fxel-ice ${DURATION_MS}ms ease-out forwards;
          filter: brightness(1.1);
        }
        @keyframes fxel-ice {
          0%   { opacity: 0; transform: scale(1.1); }
          20%  { opacity: 0.9; transform: scale(1); }
          50%  { opacity: 0.6; }
          100% { opacity: 0; transform: scale(0.98); }
        }

        .fxel__burst--electric {
          background:
            repeating-linear-gradient(
              62deg,
              transparent 0 4px,
              rgba(255, 240, 140, 0.6) 4px 6px,
              transparent 6px 16px
            ),
            radial-gradient(ellipse at center, rgba(255, 255, 200, 0.5) 0%, transparent 60%);
          animation: fxel-electric ${DURATION_MS}ms steps(12, end) forwards;
        }
        @keyframes fxel-electric {
          0%   { opacity: 0; transform: translateX(-1px); }
          10%  { opacity: 0.95; transform: translateX(1px); }
          20%  { opacity: 0.2; transform: translateX(-1px); }
          30%  { opacity: 0.9; transform: translateX(2px); }
          45%  { opacity: 0.3; }
          60%  { opacity: 0.8; }
          80%  { opacity: 0.2; }
          100% { opacity: 0; }
        }

        .fxel__burst--earth {
          background:
            radial-gradient(ellipse at 50% 80%, rgba(120, 200, 120, 0.55) 0%, transparent 55%),
            radial-gradient(ellipse at 35% 70%, rgba(160, 120, 70, 0.4) 0%, transparent 40%),
            radial-gradient(ellipse at 70% 80%, rgba(90, 150, 80, 0.45) 0%, transparent 40%);
          animation: fxel-earth ${DURATION_MS}ms ease-out forwards;
        }
        @keyframes fxel-earth {
          0%   { opacity: 0; transform: translateY(12px); filter: blur(4px); }
          20%  { opacity: 0.7; transform: translateY(0); filter: blur(0); }
          60%  { opacity: 0.5; transform: translateY(-2px); }
          100% { opacity: 0; transform: translateY(-8px); filter: blur(2px); }
        }

        .fxel__burst--hack {
          background:
            repeating-linear-gradient(
              0deg,
              transparent 0 3px,
              rgba(120, 255, 180, 0.28) 3px 4px
            ),
            linear-gradient(180deg, rgba(80, 255, 140, 0.2), transparent),
            repeating-linear-gradient(
              90deg,
              transparent 0 2px,
              rgba(255, 60, 60, 0.18) 2px 3px
            );
          animation: fxel-hack ${DURATION_MS}ms steps(20, end) forwards;
          mix-blend-mode: screen;
        }
        @keyframes fxel-hack {
          0%   { opacity: 0; transform: translateX(-2px) skewX(-1deg); }
          10%  { opacity: 0.9; transform: translateX(3px) skewX(2deg); }
          20%  { opacity: 0.4; transform: translateX(-1px); }
          35%  { opacity: 0.85; transform: translateX(2px) skewX(-2deg); }
          55%  { opacity: 0.3; }
          75%  { opacity: 0.65; }
          100% { opacity: 0; transform: translateX(0) skewX(0deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .fxel__burst {
            animation-duration: 600ms !important;
            animation-timing-function: linear !important;
          }
        }
      `}</style>
    </div>
  )
}
