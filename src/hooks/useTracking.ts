'use client';

import { useState, useEffect, useRef } from 'react';
import { updateMyLocation } from '@/actions/tracking';

/** Don't hammer the server (or Nominatim) on every GPS tick. */
const SYNC_INTERVAL_MS = 2 * 60 * 1000;

export type TrackingState = {
  location: string;
  error: string | null;
  /** False only when the user actively denied location access. */
  permissionsGranted: boolean;
  /** True once we've resolved the permission state either way. */
  hasPrompted: boolean;
};

/**
 * Watches the signed-in user's location and syncs it to their Employee record.
 *
 * Deliberately requests geolocation only. Camera and microphone are requested
 * at the point of use (video calls), not on app load — asking for them here
 * blocked users who declined and gained nothing, since the stream was
 * discarded immediately.
 */
export function useTracking() {
  const [location, setLocation] = useState<string>('Detecting location…');
  const [error, setError] = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(true);
  const [hasPrompted, setHasPrompted] = useState(false);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    let watchId: number | undefined;
    let mounted = true;

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      setHasPrompted(true);
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (!mounted) return;
        setPermissionsGranted(true);
        setHasPrompted(true);
        setError(null);

        const { latitude, longitude } = position.coords;
        let locName = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

        // Throttle the reverse-geocode + server write.
        const now = Date.now();
        if (now - lastSyncRef.current < SYNC_INTERVAL_MS) return;
        lastSyncRef.current = now;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const address = data?.address;
          if (address) {
            locName = address.city || address.town || address.village || address.state || locName;
          }
        } catch {
          // Keep the coordinate fallback.
        }

        if (!mounted) return;
        setLocation(locName);

        try {
          await updateMyLocation({ lat: latitude, lng: longitude, locName });
        } catch (e) {
          console.error('location sync failed', e);
        }
      },
      (err) => {
        if (!mounted) return;
        setHasPrompted(true);
        setError(err.message || 'Location access denied');
        setLocation('Location unavailable');
        // PERMISSION_DENIED (1) is a real refusal; timeouts and position
        // failures are transient and shouldn't be treated as one.
        setPermissionsGranted(err.code !== err.PERMISSION_DENIED);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    return () => {
      mounted = false;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return { location, error, permissionsGranted, hasPrompted };
}
