"use client";

import { useCallback, useSyncExternalStore } from "react";

// Whether the learner keeps the desktop sidebar as icons only. Saved in this browser, so the
// choice holds on every page and after a reload. The server always draws the full sidebar.

const KEY = "edorax:sidebar";
const EVENT = "edorax:sidebar-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "icons";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** `[collapsed, toggle]`. Every part of the page that reads it changes together, in every open tab. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, read() ? "full" : "icons");
    } catch {
      // Storage is optional: without it the sidebar simply stays as it is.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [collapsed, toggle];
}
