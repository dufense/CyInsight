import { useState, useEffect } from "react";
import { Download, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
    setInstalling(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 text-sm"
      data-testid="pwa-install-banner"
      role="banner"
    >
      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/20 shrink-0">
        <Shield className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">Install Cyber Command Center</span>
        <span className="hidden sm:inline text-muted-foreground ml-1.5">— fast access, offline support &amp; native feel.</span>
      </div>
      <Button
        size="sm"
        className="shrink-0 h-7 px-3 text-xs gap-1.5"
        onClick={handleInstall}
        disabled={installing}
        data-testid="button-pwa-install"
      >
        <Download className="w-3.5 h-3.5" />
        {installing ? "Installing…" : "Install"}
      </Button>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Dismiss install banner"
        data-testid="button-pwa-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function PWAUpdateNotification() {
  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setNeedsUpdate(true);
            }
          });
        });
      });
    }
  }, []);

  if (!needsUpdate) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/20 text-sm"
      data-testid="pwa-update-banner"
    >
      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
      <span className="flex-1 text-foreground">A new version is available.</span>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 px-3 text-xs border-cyan-500/30"
        onClick={() => window.location.reload()}
        data-testid="button-pwa-reload"
      >
        Update Now
      </Button>
      <button
        onClick={() => setNeedsUpdate(false)}
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss update notification"
        data-testid="button-pwa-update-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
