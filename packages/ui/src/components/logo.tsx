type LogoProps = {
  variant?: "full" | "mark";
  size?: number;
  className?: string;
};

/** Wordmark + símbolo — exportável para Figma via SVG */
export function Logo({ variant = "full", size = 36, className }: LogoProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#ina-logo-grad)" />
      <path
        d="M14 32V18h4l6 10 6-10h4v14h-3.5V24l-5.5 8h-2.5l-5.5-8v8H14z"
        fill="#fff"
        fillOpacity="0.95"
      />
      <path
        d="M32 30l4-6 4 6"
        stroke="#6EE7B7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="ina-logo-grad" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A3A5C" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );

  if (variant === "mark") return mark;

  return (
    <div className={`ina-logo ${className ?? ""}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      {mark}
      <div className="ina-logo__text">
        <span className="ina-logo__name">Inova Finance</span>
        <span className="ina-logo__tag">AI Enterprise</span>
      </div>
    </div>
  );
}
