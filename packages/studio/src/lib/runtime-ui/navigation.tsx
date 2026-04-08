import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type PropsWithChildren,
} from "react";

type StudioNavigationValue = {
  pathname: string;
  params: Record<string, string>;
  basePath?: string;
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
};

const StudioNavigationContext = createContext<
  StudioNavigationValue | undefined
>(undefined);

function useStudioNavigationContext(): StudioNavigationValue {
  const value = useContext(StudioNavigationContext);

  if (!value) {
    throw new Error(
      "Studio navigation hooks must be used within StudioNavigationProvider.",
    );
  }

  return value;
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.button !== 0
  );
}

function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//.test(href) || href.startsWith("mailto:");
}

function normalizeBasePath(path: string | undefined): string {
  if (!path) {
    return "";
  }

  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeInternalHref(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function resolveStudioRootedAdminHref(
  basePath: string,
  href: string,
): string | undefined {
  if (!basePath.endsWith("/admin")) {
    return undefined;
  }

  if (href === "/admin") {
    return basePath;
  }

  if (!href.startsWith("/admin/")) {
    return undefined;
  }

  return `${basePath}${href.slice("/admin".length)}`;
}

export function StudioNavigationProvider({
  value,
  children,
}: PropsWithChildren<{
  value: StudioNavigationValue;
}>) {
  return (
    <StudioNavigationContext.Provider value={value}>
      {children}
    </StudioNavigationContext.Provider>
  );
}

export function usePathname(): string {
  return useStudioNavigationContext().pathname;
}

export function useBasePath(): string {
  return useStudioNavigationContext().basePath ?? "";
}

export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(): T {
  return useStudioNavigationContext().params as T;
}

export function useRouter() {
  const navigation = useStudioNavigationContext();

  return {
    push: (href: string) =>
      navigation.push(resolveStudioHref(navigation.basePath, href)),
    replace: (href: string) =>
      navigation.replace(resolveStudioHref(navigation.basePath, href)),
    back: navigation.back,
  };
}

export function resolveStudioHref(
  basePath: string | undefined,
  href: string,
): string {
  if (isExternalHref(href)) {
    return href;
  }

  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedHref = normalizeInternalHref(href);

  if (normalizedBasePath.length === 0) {
    return normalizedHref;
  }

  if (
    normalizedHref === normalizedBasePath ||
    normalizedHref.startsWith(`${normalizedBasePath}/`)
  ) {
    return normalizedHref;
  }

  const studioRootedHref = resolveStudioRootedAdminHref(
    normalizedBasePath,
    normalizedHref,
  );

  if (studioRootedHref) {
    return studioRootedHref;
  }

  if (normalizedHref === "/") {
    return normalizedBasePath;
  }

  return `${normalizedBasePath}${normalizedHref}`;
}

export function RuntimeLink({
  href,
  onClick,
  target,
  rel,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
}) {
  const navigation = useStudioNavigationContext();
  const resolvedHref = isExternalHref(href)
    ? href
    : resolveStudioHref(navigation.basePath, href);

  return (
    <a
      {...props}
      href={resolvedHref}
      target={target}
      rel={rel}
      onClick={(event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          target === "_blank" ||
          isModifiedEvent(event) ||
          isExternalHref(resolvedHref)
        ) {
          return;
        }

        event.preventDefault();
        navigation.push(resolvedHref);
      }}
    />
  );
}
