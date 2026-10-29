import { useCallback, useEffect, useState } from 'react';

/**
 * A deliberately tiny hash router.
 *
 * Hash routing is used because the app is published as a static bundle: it
 * needs no server rewrite rules, works from any sub-path, and keeps deep links
 * shareable (`#/challenge/l3`).
 */

export type Route =
  | { name: 'home' }
  | { name: 'challenge' }
  | { name: 'play'; levelId: string }
  | { name: 'studio' }
  | { name: 'atelier' }
  | { name: 'math' }
  | { name: 'works' };

export const HOME: Route = { name: 'home' };
export const CHALLENGE: Route = { name: 'challenge' };
export const STUDIO: Route = { name: 'studio' };
export const ATELIER: Route = { name: 'atelier' };
export const MATH: Route = { name: 'math' };
export const WORKS: Route = { name: 'works' };
export const play = (levelId: string): Route => ({ name: 'play', levelId });

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '').split('?')[0];
  const [head, second] = clean.split('/');
  switch (head) {
    case 'challenge':
      return second ? { name: 'play', levelId: second } : CHALLENGE;
    case 'studio':
      return STUDIO;
    case 'atelier':
      return ATELIER;
    case 'math':
      return MATH;
    case 'works':
      return WORKS;
    default:
      return HOME;
  }
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'challenge':
      return '#/challenge';
    case 'play':
      return `#/challenge/${route.levelId}`;
    case 'studio':
      return '#/studio';
    case 'atelier':
      return '#/atelier';
    case 'math':
      return '#/math';
    case 'works':
      return '#/works';
    default:
      return '#/';
  }
}

/** Read `?key=value` pairs from the current hash route. */
export function readHashQuery(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const part of raw.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

const getSnapshot = () => window.location.hash;

export function useRoute(): Route {
  const [hash, setHash] = useState(getSnapshot);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return parseRoute(hash);
}

export function navigate(route: Route): void {
  const path = routeToPath(route);
  if (window.location.hash === path) return;
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useNavigate() {
  return useCallback((route: Route) => navigate(route), []);
}

/** Keep `subscribe` referenced so bundlers do not drop it in tree-shaking. */
export const routeSubscription = subscribe;
