"use client";

import { useEffect, useState } from "react";

/** Whether a media query matches, kept current. False until mounted, so the server render agrees. */
export function useMediaQuery(media: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [media]);

  return matches;
}
