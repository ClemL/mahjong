import { afterEach, vi } from "vitest";

// Only the component tests run in jsdom; the engine suite has no window.
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");

  // jsdom has neither of these. A pointer query that never matches is a mouse,
  // which is what the components assume until told otherwise.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}
