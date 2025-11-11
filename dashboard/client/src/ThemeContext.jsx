import { createContext, useContext, useMemo, useState, useEffect } from "react";

const ThemeContext = createContext(null);

const palettes = {
  forest: {
    name: "forest",
    // Deftones Saturday Night Wrist vibe
    bg: "#070a09",
    panel: "#0c100e",
    border: "#1d2320",
    text: "#e5eee9",
    accent: "#8FE3B3",
    accentSoft: "rgba(143,227,179,0.10)",
    accentBorder: "rgba(143,227,179,0.35)",
  },
  violet: {
    name: "violet",
    bg: "#0a0810",
    panel: "#100d18",
    border: "#221a38",
    text: "#f0eaff",
    accent: "#b996ff",
    accentSoft: "rgba(185,150,255,0.12)",
    accentBorder: "rgba(185,150,255,0.35)",
  },
  matte: {
    name: "matte",
    bg: "#0c0c0c",
    panel: "#151515",
    border: "#262626",
    text: "#eaeaea",
    accent: "#9aa0a6",
    accentSoft: "rgba(154,160,166,0.12)",
    accentBorder: "rgba(154,160,166,0.35)",
  },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "forest");
  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);

  const p = palettes[theme] ?? palettes.forest;

  const bundles = useMemo(() => ({
    pageBg: `min-h-screen w-full text-[${p.text}]`,
    hardBg: `bg-[${p.bg}]`,
    panel: `bg-[${p.panel}] border border-[${p.border}]`,
    border: `border border-[${p.border}]`,
    accentText: `text-[${p.accent}]`,
    btn: `bg-[${p.panel}] border border-[${p.border}] hover:bg-opacity-80 transition`,
    btnPrimary: `bg-[${p.panel}] border border-[${p.accentBorder}] hover:bg-opacity-90 transition`,
    ringAccent: `ring-2 ring-[${p.accentBorder}]`,
    softAccentBg: `bg-[${p.panel}]`,
    input: `bg-[${p.panel}] border border-[${p.border}] focus:outline-none focus:border-[${p.accent}] text-[${p.text}]`,
    gridPanel: `bg-[${p.panel}] border border-[${p.border}]`,
    text: p.text,
    accent: p.accent,
    accentSoft: p.accentSoft,
    colors: p,
  }), [p]);

  useEffect(() => {
    document.body.style.backgroundColor = p.bg;
    document.body.style.color = p.text;
  }, [p]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, bundles }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
