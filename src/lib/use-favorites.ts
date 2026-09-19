"use client";

import { useCallback, useEffect, useState } from "react";

export interface FavoritesState {
  favorites: Set<string>;
  toggle: (modelId: string) => Promise<void>;
  ready: boolean;
}

export function useFavorites(): FavoritesState {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/favorites", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as { favorites: { modelId: string }[] };
          if (!cancelled) setFavorites(new Set(data.favorites.map((f) => f.modelId)));
        }
      } catch {
        // favourites are optional
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (modelId: string) => {
    // Optimistic flip; the server call is reconciled by the next read.
    let wasFavorite = false;
    setFavorites((prev) => {
      const next = new Set(prev);
      wasFavorite = next.has(modelId);
      if (wasFavorite) next.delete(modelId);
      else next.add(modelId);
      return next;
    });

    try {
      if (wasFavorite) {
        await fetch(`/api/favorites?modelId=${encodeURIComponent(modelId)}`, {
          method: "DELETE",
        });
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        });
      }
    } catch {
      // revert on failure
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(modelId);
        else next.delete(modelId);
        return next;
      });
    }
  }, []);

  return { favorites, toggle, ready };
}
