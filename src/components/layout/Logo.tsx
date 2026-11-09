/** CodeForge mark: angle brackets with a forged slash. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#1c1830" stroke="#3b3460" />
      <path d="M12 9 6 16l6 7" fill="none" stroke="url(#logo-gradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m20 9 6 7-6 7" fill="none" stroke="url(#logo-gradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 8 14.5 24" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
