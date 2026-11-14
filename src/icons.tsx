// Icônes au trait, dessinées en SVG (aucune dépendance externe, l'app marche hors ligne).

const paths = {
  up: <path d="M6 15l6-6 6 6M7 20h10" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  gpu: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <circle cx="16" cy="12" r="2.5" />
      <path d="M4 17v3M7 17v2" />
    </>
  ),
  ram: (
    <>
      <rect x="2" y="7" width="20" height="9" rx="1" />
      <path d="M6 10v3M10 10v3M14 10v3M18 10v3M4 16v3M20 16v3" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="5" height="5" />
      <path d="M15 7h2M15 10h2M7 15h10M7 18h6" />
    </>
  ),
  disk: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="1.5" />
      <path d="M6 12h6M16 12h.01M19 12h.01" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  screen: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a14 14 0 0120 0" />
      <circle cx="12" cy="19.5" r="1" />
    </>
  ),
  audio: (
    <>
      <path d="M4 14v-2a8 8 0 0116 0v2" />
      <rect x="2" y="14" width="5" height="7" rx="1.5" />
      <rect x="17" y="14" width="5" height="7" rx="1.5" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17.5v.01" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  cart: <path d="M3 4h2l2.4 11h11L21 7H6.2M9 20h.01M18 20h.01" />,
  bell: <path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
