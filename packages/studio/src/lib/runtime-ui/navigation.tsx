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

export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(): T {
  return useStudioNavigationContext().params as T;
}

export function useRouter() {
  const navigation = useStudioNavigationContext();

  return {
    push: navigation.push,
    replace: navigation.replace,
    back: navigation.back,
  };
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

  return (
    <a
      {...props}
      href={href}
      target={target}
      rel={rel}
      onClick={(event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          target === "_blank" ||
          isModifiedEvent(event) ||
          isExternalHref(href)
        ) {
          return;
        }

        event.preventDefault();
        navigation.push(href);
      }}
    />
  );
}
