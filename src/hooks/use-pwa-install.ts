"use client";

/**
 * usePwaInstall — capture and expose the browser's native A2HS install prompt.
 *
 * DESIGN NOTES
 * ────────────
 * Chrome/Edge fire a `beforeinstallprompt` event when the PWA install criteria
 * are met (service worker active, manifest valid, HTTPS, not yet installed).
 * We capture the event and hold it so the app can show a custom install banner
 * at a contextually appropriate moment (e.g., after a scorer completes their
 * first match) rather than relying on the browser's auto-prompt.
 *
 * Safari on iOS doesn't fire `beforeinstallprompt`. It uses a separate
 * `navigator.standalone` approach — `isInstalled` covers that case.
 *
 * The `appinstalled` event fires after the user accepts the install, allowing
 * the UI to update (e.g., hide the install prompt CTA).
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The `BeforeInstallPromptEvent` is not in the standard lib.dom.d.ts.
 * We declare a minimal interface to avoid casting to `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaInstallState {
  /**
   * True when a native install prompt is available (Chrome/Edge on Android and
   * desktop). False on iOS Safari, Firefox, or when already installed.
   */
  canInstall: boolean;

  /** True when the PWA is already running in standalone mode (installed). */
  isInstalled: boolean;

  /**
   * Trigger the native install prompt. Returns the user's choice, or `null`
   * if the prompt is not available.
   */
  promptInstall: () => Promise<"accepted" | "dismissed" | null>;

  /**
   * True during the window between calling `promptInstall()` and receiving the
   * user's answer. Use this to disable the install button to prevent double-taps.
   */
  isPrompting: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Standard display-mode query (Chrome/Edge installed PWA).
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari standalone flag.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- iOS-specific property
  if ((navigator as any).standalone === true) return true;
  return false;
}

export function usePwaInstall(): PwaInstallState {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(detectStandalone);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // Prevent Chrome from showing its mini-infobar automatically.
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Also listen for display-mode changes (user installs from browser menu).
    const mq = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };
    mq.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mq.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | null> => {
    const prompt = deferredPrompt.current;
    if (!prompt) return null;

    setIsPrompting(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        deferredPrompt.current = null;
        setCanInstall(false);
      }
      return outcome;
    } finally {
      setIsPrompting(false);
    }
  }, []);

  return { canInstall, isInstalled, promptInstall, isPrompting };
}
