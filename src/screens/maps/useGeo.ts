import { useEffect, useRef, useState } from 'react';
import { bearing, haversine, type LngLat } from '../../core/maps/geo';

export interface GeoFix {
  at: LngLat;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  time: number;
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

export function useGeo(active = true) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const last = useRef<GeoFix | null>(null);
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus((s) => (s === 'ok' ? s : 'locating'));
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const at: LngLat = [p.coords.longitude, p.coords.latitude];
        const prev = last.current;
        let heading = Number.isFinite(p.coords.heading ?? NaN) && (p.coords.speed ?? 0) > 0.8 ? (p.coords.heading as number) : null;
        if (heading === null && prev && haversine(prev.at, at) > 8) heading = bearing(prev.at, at);
        const next: GeoFix = { at, accuracy: p.coords.accuracy, heading: heading ?? prev?.heading ?? null, speed: p.coords.speed, time: p.timestamp || Date.now() };
        last.current = next;
        setFix(next);
        setStatus('ok');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : last.current ? 'ok' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { fix, status };
}
