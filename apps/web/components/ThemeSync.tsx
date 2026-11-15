"use client";
import { useEffect } from "react";

/** Applies the saved theme and Bible font size to <html>, so CSS tokens follow the preference. */
export function ThemeSync({ theme, bibleFontSize }: { theme: string; bibleFontSize: number }) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
    root.style.setProperty("--bible-font-size", `${bibleFontSize}px`);
  }, [theme, bibleFontSize]);
  return null;
}
