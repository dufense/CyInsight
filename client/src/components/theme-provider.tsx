import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "light" | "dark";
type AccentColorName = "blue" | "purple" | "green" | "teal" | "orange" | "red" | "pink" | "amber";

interface AccentColor {
  name: AccentColorName;
  value: string;
  label: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { name: "blue", value: "221 83% 53%", label: "Blue" },
  { name: "purple", value: "262 83% 58%", label: "Purple" },
  { name: "green", value: "142 71% 45%", label: "Green" },
  { name: "teal", value: "173 80% 40%", label: "Teal" },
  { name: "orange", value: "25 95% 53%", label: "Orange" },
  { name: "red", value: "0 84% 60%", label: "Red" },
  { name: "pink", value: "330 81% 60%", label: "Pink" },
  { name: "amber", value: "38 92% 50%", label: "Amber" },
];

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  accentColor: AccentColorName;
  setAccentColor: (color: AccentColorName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  accentColor: "blue",
  setAccentColor: () => {},
});

function applyAccentColor(colorName: AccentColorName) {
  const accent = ACCENT_COLORS.find(c => c.name === colorName) || ACCENT_COLORS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", accent.value);

  const parts = accent.value.split(" ");
  const lightness = parseFloat(parts[2]);
  const foreground = lightness < 60 ? "0 0% 100%" : "0 0% 0%";
  root.style.setProperty("--primary-foreground", foreground);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as Theme) || "dark";
    }
    return "dark";
  });

  const [accentColor, setAccentColorState] = useState<AccentColorName>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("accent-color") as AccentColorName) || "blue";
    }
    return "blue";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    applyAccentColor(accentColor);
    localStorage.setItem("accent-color", accentColor);
  }, [accentColor]);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  const setAccentColor = (color: AccentColorName) => {
    setAccentColorState(color);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
