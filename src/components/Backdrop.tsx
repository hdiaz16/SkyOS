/** Calm, nature-inspired background: sky gradient, slow drifting light, soft hills. Purely decorative. */
export function Backdrop() {
  return (
    <div className="backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <svg
        className="absolute inset-x-0 bottom-0 h-[30vh] w-full"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200 C 240 120, 420 260, 720 190 S 1200 90, 1440 170 L1440 320 L0 320 Z"
          fill="var(--hill-1)"
        />
        <path
          d="M0 260 C 300 200, 560 300, 860 250 S 1260 190, 1440 240 L1440 320 L0 320 Z"
          fill="var(--hill-2)"
        />
      </svg>
    </div>
  )
}
