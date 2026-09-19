"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "llminfo.compare.v1";
const MAX = 4;

export interface CompareState {
  compare: string[];
  toggle: (modelId: string) => void;
  clear: () => void;
  isFull: boolean;
  max: number;
}

/** Comparison set persists locally; it is presentation state, not user data. */
export function useCompare(): CompareState {
  const [compare, setCompare] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCompare((JSON.parse(raw) as string[]).slice(0, MAX));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const persist = useCallback((next: string[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
  }, []);

  const toggle = useCallback(
    (modelId: string) => {
      setCompare((prev) => {
        let next: string[];
        if (prev.includes(modelId)) {
          next = prev.filter((id) => id !== modelId);
        } else if (prev.length >= MAX) {
          // Keep the newest selection and drop the oldest.
          next = [...prev.slice(1), modelId];
        } else {
          next = [...prev, modelId];
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clear = useCallback(() => {
    setCompare([]);
    persist([]);
  }, [persist]);

  return { compare, toggle, clear, isFull: compare.length >= MAX, max: MAX };
}
