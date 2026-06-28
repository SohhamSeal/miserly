import { useEffect } from "react";
import { useResolvedTheme } from "@/store/useSettingsStore";

/**
 * Applies the resolved theme (light/dark) as a class on <html>. All colors are
 * CSS variables, so toggling the class re-themes the whole app instantly.
 * Renders nothing.
 */
export function ThemeController() {
  const resolved = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", resolved === "light");
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }, [resolved]);

  return null;
}
