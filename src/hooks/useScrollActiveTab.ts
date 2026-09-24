import { useEffect, useRef, useCallback } from 'react';

export interface UseScrollActiveTabOptions {
  /**
   * Distance in pixels from the left/right edge of the container to keep as padding.
   * Default: 16
   */
  padding?: number;
  /**
   * Scroll behavior: 'smooth' for animated scrolling, 'auto' for instant.
   * Default: 'smooth'
   */
  behavior?: ScrollBehavior;
  /**
   * Optional custom CSS selector to find the active tab element inside the container.
   */
  activeSelector?: string;
}

/**
 * Custom React hook ensuring that the currently selected/active tab inside a
 * horizontally scrollable container is ALWAYS completely visible inside the viewport,
 * especially on small/mobile screens.
 *
 * UX Rules Enforced:
 * 1. Change the active tab.
 * 2. Animate the horizontal active underline from the previous tab to the new tab.
 * 3. Automatically scroll the tab container so the entire active tab is visible.
 *
 * Guarantees:
 * - Only the tab container scrolls (the entire page/window is NEVER shifted).
 * - Works in both directions: Left → Right, Right → Left, and far jumps.
 * - On desktop/wide screens where all tabs fit, no unnecessary scroll occurs.
 * - On mobile/small screens, smooth scrolling ensures tab labels are never clipped or truncated.
 */
export function useScrollActiveTab<T extends HTMLElement = HTMLDivElement>(
  activeTabKey: string | number | undefined,
  options: UseScrollActiveTabOptions = {}
) {
  const containerRef = useRef<T>(null);
  const { padding = 16, behavior = 'smooth', activeSelector } = options;

  const scrollToActiveTab = useCallback(
    (customBehavior: ScrollBehavior = behavior) => {
      const container = containerRef.current;
      if (!container) return;

      // If container has no horizontal scrollable overflow, no scrolling needed
      if (container.scrollWidth <= container.clientWidth) {
        return;
      }

      // Priority 1: User-specified custom active selector
      let activeElement: HTMLElement | null = activeSelector
        ? container.querySelector(activeSelector)
        : null;

      // Priority 2: Standard HTML5 data-active="true" attribute
      if (!activeElement) {
        activeElement = container.querySelector('[data-active="true"]');
      }

      // Priority 3: WAI-ARIA aria-selected="true" attribute
      if (!activeElement) {
        activeElement = container.querySelector('[aria-selected="true"]');
      }

      // Priority 4: Tab button matching activeTabKey by data-tab, id, or name
      if (!activeElement && activeTabKey !== undefined && activeTabKey !== '') {
        const keyStr = String(activeTabKey);
        activeElement = (
          container.querySelector(`[data-tab="${keyStr}"]`) ||
          container.querySelector(`[id*="${keyStr}"]`) ||
          container.querySelector(`button[name="${keyStr}"]`)
        ) as HTMLElement | null;
      }

      // Priority 5: CSS class .tab-underline-link.active or .active
      if (!activeElement) {
        activeElement = container.querySelector('.tab-underline-link.active, .active') as HTMLElement | null;
      }

      if (!activeElement) return;

      const containerRect = container.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();

      // Case A: Active tab is clipped or hidden on the left (Navigating Right → Left)
      if (tabRect.left < containerRect.left + padding) {
        const diff = tabRect.left - (containerRect.left + padding);
        const targetScrollLeft = Math.max(0, container.scrollLeft + diff);
        container.scrollTo({
          left: targetScrollLeft,
          behavior: customBehavior,
        });
      }
      // Case B: Active tab is clipped or hidden on the right (Navigating Left → Right)
      else if (tabRect.right > containerRect.right - padding) {
        const diff = tabRect.right - (containerRect.right - padding);
        const maxScroll = container.scrollWidth - container.clientWidth;
        const targetScrollLeft = Math.min(maxScroll, container.scrollLeft + diff);
        container.scrollTo({
          left: targetScrollLeft,
          behavior: customBehavior,
        });
      }
    },
    [activeTabKey, padding, behavior, activeSelector]
  );

  useEffect(() => {
    // 1. Initial requestAnimationFrame right after React DOM commit & paint
    const rafId = requestAnimationFrame(() => {
      scrollToActiveTab(behavior);
    });

    // 2. Secondary micro-task timeout (50ms) to synchronize with Framer Motion underline animations
    // and badge counter re-renders without layout thrashing
    const timeoutId = setTimeout(() => {
      scrollToActiveTab(behavior);
    }, 50);

    // 3. Responsive ResizeObserver to re-align active tab upon device orientation or viewport resize
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        scrollToActiveTab('auto');
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [scrollToActiveTab, behavior]);

  return { containerRef, scrollToActiveTab };
}
