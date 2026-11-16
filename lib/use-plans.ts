import { useSyncExternalStore } from 'react';
import { getServerSnapshot, getSnapshot, subscribe, type StoreSnapshot } from './plans-store';

/** Saved plans from localStorage. Renders empty on the server and during hydration. */
export function usePlans(): StoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
