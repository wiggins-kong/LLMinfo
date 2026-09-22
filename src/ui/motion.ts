export type MotionReason = "startup" | "tab" | "query" | "sync" | "none";

export type OverlayKind = "drawer" | "settings" | "menu" | "modal";
export type SelectionMotion = "enter" | "exit" | "list";

export interface MotionTimings {
  micro: number;
  transition: number;
  exit: number;
  chart: number;
  stagger: number;
  reducedFade: number;
}

export const DESKTOP_TIMINGS: MotionTimings = {
  micro: 90,
  transition: 160,
  exit: 180,
  chart: 300,
  stagger: 18,
  reducedFade: 80,
};

export const MOBILE_TIMINGS: MotionTimings = {
  micro: 70,
  transition: 130,
  exit: 150,
  chart: 240,
  stagger: 12,
  reducedFade: 80,
};

export const QUERY_SETTLE_MS = 250;
export const REMOVE_MS = 140;
export const REMOVE_MOBILE_MS = 110;
export const MAX_STAGGERED_ITEMS = 6;
export const MAX_MOBILE_STAGGERED_ITEMS = 3;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isMobileMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

export function motionTimings(mobile = isMobileMotion()): MotionTimings {
  return mobile ? MOBILE_TIMINGS : DESKTOP_TIMINGS;
}

export function shouldAnimateReason(reason: MotionReason): boolean {
  return reason !== "none";
}

export function staggerLimit(mobile = isMobileMotion()): number {
  return mobile ? MAX_MOBILE_STAGGERED_ITEMS : MAX_STAGGERED_ITEMS;
}

export function removalDuration(mobile = isMobileMotion()): number {
  return mobile ? REMOVE_MOBILE_MS : REMOVE_MS;
}

/**
 * Rows recycled by the virtual scroller are recreated on every scroll frame,
 * so they must never carry enter motion. Only a fresh result set animates.
 */
export function motionItemAttribute(animate: boolean): string {
  return animate ? " data-motion-item" : "";
}

export function selectionMotionAttribute(motion: SelectionMotion): string {
  return ` data-selection-motion="${motion}"`;
}

export interface EnterOptions {
  reason: MotionReason;
  root: HTMLElement;
  content?: HTMLElement | null;
}

function markStagger(root: HTMLElement): void {
  const items = root.querySelectorAll<HTMLElement>("[data-motion-item]");
  const limit = Math.min(items.length, staggerLimit());
  for (let index = 0; index < limit; index += 1) {
    const item = items[index];
    if (!item) continue;
    item.style.setProperty("--motion-delay", `${index * motionTimings().stagger}ms`);
  }
}

export function playEnter({ reason, root, content }: EnterOptions): void {
  if (!shouldAnimateReason(reason)) return;
  const target = content ?? root.querySelector<HTMLElement>("[data-motion-content]");
  if (!target) return;
  target.dataset.motionReason = reason;
  markStagger(target);
}

export interface ExitOptions {
  node: HTMLElement | null;
  kind: OverlayKind;
  duration?: number;
}

export function playExit({ node, kind, duration }: ExitOptions): Promise<void> {
  if (!node) return Promise.resolve();
  // A node that just finished entering still carries data-motion-enter, whose
  // enter animation outranks the exit rules and would freeze it in place until
  // the timeout removed it. Drop the flag so the exit animation starts now.
  node.removeAttribute("data-motion-enter");
  if (prefersReducedMotion()) {
    node.style.pointerEvents = "none";
    node.dataset.motionState = "exit";
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve();
      }, motionTimings().reducedFade);
    });
  }
  node.style.pointerEvents = "none";
  node.dataset.motionState = "exit";
  node.dataset.motionKind = kind;
  const wait = duration ?? motionTimings().exit;
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve();
    }, wait);
  });
}
