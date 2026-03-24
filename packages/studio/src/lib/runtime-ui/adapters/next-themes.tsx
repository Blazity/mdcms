import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type Theme = "light" | "dark" | "system";

export type ThemeProviderProps = PropsWithChildren<{
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}>;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveInitialTheme(defaultTheme: Theme | undefined): Theme {
  if (defaultTheme === "dark") {
    return "dark";
  }

  return "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitialTheme(defaultTheme),
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return value;
}
