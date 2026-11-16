import type { Turn } from '../../core/maps/route';

const PATHS: Record<Turn, string> = {
  depart: 'M12 20V5M6 11l6-6 6 6',
  straight: 'M12 21V4M6 10l6-6 6 6',
  'slight-right': 'M8 21v-7c0-2 1-3.5 2.5-5L16 4M10.5 4H16v5.5',
  right: 'M7 21v-8a4 4 0 0 1 4-4h8M14 4l5 5-5 5',
  'sharp-right': 'M8 4v9a4 4 0 0 0 4 4h0a4 4 0 0 0 3-1.5L19 11M19 17v-6h-6',
  uturn: 'M16 21V9a5 5 0 0 0-10 0v4M2 9l4 5 4-5',
  'sharp-left': 'M16 4v9a4 4 0 0 1-4 4h0a4 4 0 0 1-3-1.5L5 11M5 17v-6h6',
  left: 'M17 21v-8a4 4 0 0 0-4-4H5M10 4L5 9l5 5',
  'slight-left': 'M16 21v-7c0-2-1-3.5-2.5-5L8 4M13.5 4H8v5.5',
  roundabout: 'M12 21v-5M12 16a4 4 0 1 1 4-4M16 12h4M17 9l3 3-3 3',
  'roundabout-exit': 'M8 21v-5a4 4 0 0 1 1.2-2.8L16 6M11 6h5v5',
  merge: 'M7 21l5-8V3M17 21l-5-8M8 7l4-4 4 4',
  'ramp-right': 'M9 21V11l7-7M11 4h5v5',
  'ramp-left': 'M15 21V11L8 4M13 4H8v5',
  'keep-right': 'M9 21v-8l6-6V3M12 6l3-3 3 3',
  'keep-left': 'M15 21v-8L9 7V3M6 6l3-3 3 3',
  ferry: 'M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M5 14l1-6h12l1 6M9 8V5h6v3',
  arrive: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};

export function Maneuver({ turn, size = 28, color = 'currentColor' }: { turn: Turn; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[turn] ?? PATHS.straight} />
    </svg>
  );
}
