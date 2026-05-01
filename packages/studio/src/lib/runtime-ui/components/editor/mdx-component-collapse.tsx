"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MdxComponentCollapseMode = "expanded" | "collapsed";

// `null` for `globalState` means "no global broadcast has happened yet" —
// each node view keeps its own local collapsed/expanded state. Once the user
// hits the toolbar collapse/expand toggle, `globalState` flips and
// `generation` bumps; node views observe the bump and reset their local
// state to match. This lets us express "collapse all then keep individual
// expansions" without the editor having to track per-node identity.
export type MdxComponentCollapseSnapshot = {
  globalState: MdxComponentCollapseMode | null;
  generation: number;
};

const defaultSnapshot: MdxComponentCollapseSnapshot = {
  globalState: null,
  generation: 0,
};

// Extracted as a pure helper so the snapshot transition contract — the
// `generation` bump that node views observe — is testable without spinning
// up React just to drive a hook.
export function nextMdxComponentCollapseSnapshot(
  previous: MdxComponentCollapseSnapshot,
  next: MdxComponentCollapseMode,
): MdxComponentCollapseSnapshot {
  return {
    globalState: next,
    generation: previous.generation + 1,
  };
}

export function toggleMdxComponentCollapseSnapshot(
  previous: MdxComponentCollapseSnapshot,
): MdxComponentCollapseSnapshot {
  return nextMdxComponentCollapseSnapshot(
    previous,
    previous.globalState === "collapsed" ? "expanded" : "collapsed",
  );
}

const MdxComponentCollapseContext =
  createContext<MdxComponentCollapseSnapshot>(defaultSnapshot);

export function useMdxComponentCollapseSnapshot(): MdxComponentCollapseSnapshot {
  return useContext(MdxComponentCollapseContext);
}

export function MdxComponentCollapseProvider(props: {
  snapshot: MdxComponentCollapseSnapshot;
  children: ReactNode;
}) {
  return (
    <MdxComponentCollapseContext.Provider value={props.snapshot}>
      {props.children}
    </MdxComponentCollapseContext.Provider>
  );
}

export type MdxComponentCollapseController = {
  snapshot: MdxComponentCollapseSnapshot;
  broadcastGlobalCollapse: (next: MdxComponentCollapseMode) => void;
  toggleGlobalCollapse: () => void;
};

export function useMdxComponentCollapseController(): MdxComponentCollapseController {
  const [snapshot, setSnapshot] =
    useState<MdxComponentCollapseSnapshot>(defaultSnapshot);

  const broadcastGlobalCollapse = useCallback(
    (next: MdxComponentCollapseMode) => {
      setSnapshot((previous) =>
        nextMdxComponentCollapseSnapshot(previous, next),
      );
    },
    [],
  );

  const toggleGlobalCollapse = useCallback(() => {
    setSnapshot((previous) => toggleMdxComponentCollapseSnapshot(previous));
  }, []);

  return useMemo(
    () => ({ snapshot, broadcastGlobalCollapse, toggleGlobalCollapse }),
    [snapshot, broadcastGlobalCollapse, toggleGlobalCollapse],
  );
}
