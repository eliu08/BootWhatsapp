import React from 'react';
import { ProductVisualType } from '../types/sales';

interface ProductVisualProps {
  visualType: ProductVisualType;
  className?: string;
}

export const ProductVisual: React.FC<ProductVisualProps> = ({
  visualType,
  className = 'w-full h-36',
}) => {
  switch (visualType) {
    case 'headphones':
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-36 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="100" cy="75" r="52" fill="#10b981" fillOpacity="0.08" />
            <path
              d="M52 78V66C52 39.4903 73.4903 18 100 18C126.51 18 148 39.4903 148 66V78"
              stroke="#e2e8f0"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M62 42C72 28 85 22 100 22C115 22 128 28 138 42"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.6"
            />
            <rect
              x="38"
              y="66"
              width="24"
              height="44"
              rx="12"
              fill="#334155"
              stroke="#94a3b8"
              strokeWidth="2.5"
            />
            <rect
              x="138"
              y="66"
              width="24"
              height="44"
              rx="12"
              fill="#334155"
              stroke="#94a3b8"
              strokeWidth="2.5"
            />
            <rect x="56" y="72" width="8" height="32" rx="4" fill="#0f172a" />
            <rect x="136" y="72" width="8" height="32" rx="4" fill="#0f172a" />
            <circle cx="48" cy="96" r="3" fill="#10b981" />
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-slate-300/80">
            HI-RES ANC 48dB
          </span>
        </div>
      );

    case 'smartwatch':
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-zinc-900 via-slate-800 to-teal-950 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-36 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="82" y="10" width="36" height="24" rx="4" fill="#475569" />
            <rect x="82" y="106" width="36" height="24" rx="4" fill="#475569" />
            <rect
              x="66"
              y="28"
              width="68"
              height="84"
              rx="18"
              fill="#0f172a"
              stroke="#cbd5e1"
              strokeWidth="4"
            />
            <rect
              x="134"
              y="46"
              width="5"
              height="16"
              rx="2.5"
              fill="#f97316"
            />
            <circle
              cx="100"
              cy="70"
              r="22"
              stroke="#14b8a6"
              strokeWidth="4"
              strokeDasharray="100 30"
            />
            <circle
              cx="100"
              cy="70"
              r="15"
              stroke="#38bdf8"
              strokeWidth="3.5"
              strokeDasharray="70 30"
            />
            <text
              x="100"
              y="74"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="11"
              fontFamily="monospace"
              fontWeight="bold"
            >
              09:41
            </text>
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-teal-300/80">
            TITANIUM 49MM
          </span>
        </div>
      );

    case 'espresso':
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-stone-900 via-neutral-800 to-amber-950 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-36 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="56"
              y="20"
              width="88"
              height="98"
              rx="10"
              fill="#292524"
              stroke="#a8a29e"
              strokeWidth="3"
            />
            <rect
              x="64"
              y="28"
              width="72"
              height="22"
              rx="4"
              fill="#44403c"
            />
            <circle cx="100" cy="39" r="7" fill="#1c1917" stroke="#f59e0b" strokeWidth="2" />
            <rect x="88" y="54" width="24" height="12" rx="3" fill="#78716c" />
            <path d="M112 60H138" stroke="#d6d3d1" strokeWidth="4" strokeLinecap="round" />
            <rect
              x="84"
              y="78"
              width="32"
              height="28"
              rx="4"
              fill="#f59e0b"
              fillOpacity="0.25"
              stroke="#fbbf24"
              strokeWidth="2"
            />
            <path d="M96 66V78M104 66V78" stroke="#d97706" strokeWidth="2.5" />
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-amber-300/80">
            19 BAR BARISTA
          </span>
        </div>
      );

    case 'keyboard':
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-slate-800 via-zinc-800 to-slate-900 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-40 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="26"
              y="40"
              width="148"
              height="62"
              rx="8"
              fill="#1e293b"
              stroke="#94a3b8"
              strokeWidth="3"
            />
            {/* Row 1 */}
            <rect x="36" y="50" width="12" height="10" rx="2" fill="#f97316" />
            <rect x="52" y="50" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="68" y="50" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="84" y="50" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="100" y="50" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="116" y="50" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="132" y="50" width="12" height="10" rx="2" fill="#64748b" />
            <circle cx="156" cy="55" r="5" fill="#38bdf8" />
            {/* Row 2 */}
            <rect x="36" y="64" width="16" height="10" rx="2" fill="#64748b" />
            <rect x="56" y="64" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="72" y="64" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="88" y="64" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="104" y="64" width="12" height="10" rx="2" fill="#e2e8f0" />
            <rect x="120" y="64" width="22" height="10" rx="2" fill="#10b981" />
            <rect x="146" y="64" width="16" height="10" rx="2" fill="#64748b" />
            {/* Spacebar Row */}
            <rect x="36" y="78" width="28" height="10" rx="2" fill="#64748b" />
            <rect x="68" y="78" width="60" height="10" rx="2" fill="#f8fafc" />
            <rect x="132" y="78" width="30" height="10" rx="2" fill="#64748b" />
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-sky-300/80">
            CNC ALUMINUM 75%
          </span>
        </div>
      );

    case 'speaker':
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-900 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-36 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="64"
              y="22"
              width="72"
              height="96"
              rx="22"
              fill="#1e293b"
              stroke="#64748b"
              strokeWidth="3"
            />
            <circle cx="100" cy="52" r="14" fill="#0f172a" stroke="#34d399" strokeWidth="2.5" />
            <circle cx="100" cy="52" r="5" fill="#34d399" />
            <circle cx="100" cy="90" r="18" fill="#0f172a" stroke="#94a3b8" strokeWidth="2.5" />
            <circle cx="100" cy="90" r="7" fill="#475569" />
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-emerald-300/80">
            360° 60W IP67
          </span>
        </div>
      );

    case 'backpack':
    default:
      return (
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-zinc-900 flex items-center justify-center ${className}`}
        >
          <svg
            viewBox="0 0 200 140"
            className="w-36 h-28 drop-shadow-lg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M84 24C84 17 91 14 100 14C109 14 116 17 116 24"
              stroke="#94a3b8"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <rect
              x="62"
              y="24"
              width="76"
              height="94"
              rx="16"
              fill="#1e293b"
              stroke="#818cf8"
              strokeWidth="2.5"
            />
            <rect
              x="72"
              y="62"
              width="56"
              height="44"
              rx="8"
              fill="#0f172a"
              stroke="#475569"
              strokeWidth="2"
            />
            <path d="M74 44H126" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="absolute bottom-2 right-2.5 text-[10px] font-mono tracking-wider text-indigo-300/80">
            CORDURA 16" PRO
          </span>
        </div>
      );
  }
};
