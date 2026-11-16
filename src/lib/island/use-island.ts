"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import { useIslandContext, useReducedMotion } from "./context";
import type { Activity, IslandApi, PresentationKind } from "./types";

/**
 * Starts, updates and ends activities. The returned object is stable; reading `activities` or
 * `presentation` during render re-renders the caller when they change.
 */
export const useIsland = (): IslandApi => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: useIsland() must be called inside <IslandProvider>.");
  const { store } = context;
  // Subscribing keeps `activities` and `presentation` fresh for callers that render them.
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.api;
};

/**
 * The same stable API as `useIsland()`, without subscribing: the caller does not re-render when
 * the island changes. Use it in components that only start, update and end activities. Reading
 * `activities` or `presentation` still returns the current value, it just won't trigger a render.
 */
export const useIslandActions = (): IslandApi => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: useIslandActions() must be called inside <IslandProvider>.");
  return context.store.api;
};

/**
 * Subscribes only to the set and order of active activity IDs. Content updates (such as a call
 * timer ticking or upload percentage changing) do not rerender callers that only need presence.
 */
export const useIslandActivityIds = (): readonly string[] => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: useIslandActivityIds() must be called inside <IslandProvider>.");
  const cache = useRef<readonly string[]>([]);
  const getSnapshot = useCallback(() => {
    const next = context.store.api.activities.map((activity) => activity.id);
    const previous = cache.current;
    if (next.length === previous.length && next.every((id, index) => id === previous[index])) return previous;
    cache.current = next;
    return next;
  }, [context.store]);
  return useSyncExternalStore(context.store.subscribe, getSnapshot, getSnapshot);
};

/**
 * Subscribes only to one activity by id. Callers that render a single activity
 * (such as the route-navigation bead) do not re-render when any other activity
 * ticks. Activity objects are stable unless that activity itself updates, so
 * the cached reference is the change signal — the same pattern as
 * useIslandActivityIds above.
 */
export const useIslandActivity = (id: string): Activity | undefined => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: useIslandActivity() must be called inside <IslandProvider>.");
  const cache = useRef<Activity | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = context.store.api.activities.find((activity) => activity.id === id);
    if (next === cache.current) return next;
    cache.current = next;
    return next;
  }, [context.store, id]);
  return useSyncExternalStore(context.store.subscribe, getSnapshot, getSnapshot);
};

/** Whether the island runs reduced motion: the provider's `reducedMotion` setting resolved against the system's. */
export const useIslandReducedMotion = (): boolean => {
  const context = useIslandContext();
  return useReducedMotion(context?.reducedMotion ?? "user");
};

/**
 * Subscribes only to the island's presentation kind ("idle" | "compact" |
 * "expanded" | ...). Callers that react to expansion changes — but not to
 * every activity content tick — re-render only when the kind itself changes.
 * The kind is a plain string, so the store's getter is already a stable
 * snapshot; no reference cache is needed.
 */
export const useIslandPresentation = (): PresentationKind => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: useIslandPresentation() must be called inside <IslandProvider>.");
  const getSnapshot = useCallback(() => context.store.api.presentation, [context.store]);
  return useSyncExternalStore(context.store.subscribe, getSnapshot, getSnapshot);
};
