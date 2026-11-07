// Stylized city map with "busy" heat spots — the hero graphic, in the spirit of the Dasher homescreen.
export function MapArt({ className }: { className?: string }) {
  const spots = [
    { x: 300, y: 170, r: 90 },
    { x: 620, y: 260, r: 120 },
    { x: 860, y: 140, r: 80 },
    { x: 470, y: 420, r: 70 },
    { x: 1050, y: 360, r: 100 },
  ];
  return (
    <svg className={className} viewBox="0 0 1200 560" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="heat">
          <stop offset="0%" stopColor="#ff3008" stopOpacity=".55" />
          <stop offset="55%" stopColor="#ff6a00" stopOpacity=".18" />
          <stop offset="100%" stopColor="#ff6a00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="560" fill="#ebebeb" />
      <path d="M0 470 C 200 430, 260 520, 460 500 S 760 420, 1200 480 V560 H0Z" fill="#cfe3f2" />
      <rect x="720" y="380" width="170" height="90" rx="18" fill="#dcebd6" />
      <rect x="90" y="250" width="120" height="120" rx="18" fill="#dcebd6" />
      <g stroke="#fff" strokeLinecap="round" fill="none">
        <path d="M-20 120 L1220 60" strokeWidth="18" />
        <path d="M-20 330 L1220 300" strokeWidth="14" />
        <path d="M150 -20 L260 580" strokeWidth="14" />
        <path d="M560 -20 L520 580" strokeWidth="18" />
        <path d="M980 -20 L1060 580" strokeWidth="14" />
        <path d="M-20 210 L1220 200 M-20 410 L1220 380 M380 -20 L400 580 M760 -20 L780 580" strokeWidth="7" />
      </g>
      <path d="M-20 260 C 300 200, 500 300, 760 220 S 1100 160, 1220 190" stroke="#f9d36b" strokeWidth="10" fill="none" />
      {spots.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r={s.r} fill="url(#heat)" />
          <circle cx={s.x} cy={s.y} r="17" fill="#191919" />
          <path
            transform={`translate(${s.x - 8} ${s.y - 10}) scale(0.67)`}
            d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z"
            fill="#fff"
          />
        </g>
      ))}

    </svg>
  );
}
