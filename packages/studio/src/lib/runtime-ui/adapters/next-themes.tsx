import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type Theme = "light" | "dark" | "system";
type AppliedTheme = "light" | "dark";
type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

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

export const STUDIO_THEME_STORAGE_KEY = "mdcms-studio-theme";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredThemePreference(
  storage: ThemeStorage | null | undefined,
): Theme | null {
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(STUDIO_THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistStoredThemePreference(
  storage: ThemeStorage | null | undefined,
  theme: Theme,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STUDIO_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore browser storage failures and keep the in-memory preference active.
  }
}

export function applyThemePreferencePersistence(input: {
  storage: ThemeStorage | null | undefined;
  theme: Theme;
  hasMounted: boolean;
}): boolean {
  if (!input.hasMounted) {
    return true;
  }

  persistStoredThemePreference(input.storage, input.theme);
  return true;
}

function readSystemPrefersDark(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveThemePreference(input: {
  storedTheme: Theme | null;
  defaultTheme: Theme | undefined;
  enableSystem: boolean | undefined;
  systemPrefersDark: boolean;
}): Theme {
  if (input.storedTheme) {
    return input.storedTheme;
  }

  if (input.defaultTheme === "light" || input.defaultTheme === "dark") {
    return input.defaultTheme;
  }

  if (input.defaultTheme === "system" && input.enableSystem) {
    return "system";
  }

  if (input.enableSystem) {
    return "system";
  }

  return "light";
}

export function resolveAppliedTheme(
  theme: Theme,
  systemPrefersDark: boolean,
): AppliedTheme {
  if (theme === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return theme === "dark" ? "dark" : "light";
}

function resolveInitialTheme(input: {
  defaultTheme: Theme | undefined;
  enableSystem: boolean | undefined;
}): Theme {
  const systemPrefersDark = readSystemPrefersDark();
  const storage =
    typeof window === "undefined" ? null : (window.localStorage ?? null);

  return resolveThemePreference({
    storedTheme: readStoredThemePreference(storage),
    defaultTheme: input.defaultTheme,
    enableSystem: input.enableSystem,
    systemPrefersDark,
  });
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "light",
  enableSystem = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitialTheme({
      defaultTheme,
      enableSystem,
    }),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    readSystemPrefersDark(),
  );
  const hasMountedThemePersistence = useRef(false);

  useEffect(() => {
    if (
      !enableSystem ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, [enableSystem]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const nextTheme = resolveAppliedTheme(theme, systemPrefersDark);

    if (attribute === "class") {
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      return;
    }

    document.documentElement.setAttribute(attribute, nextTheme);
  }, [attribute, systemPrefersDark, theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    hasMountedThemePersistence.current = applyThemePreferencePersistence({
      storage: window.localStorage ?? null,
      theme,
      hasMounted: hasMountedThemePersistence.current,
    });
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
