import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelpCircle } from "lucide-react";

export type TourStep = {
  targetSelector: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
};

type GuidedTourProps = {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const COMPLETED_TOURS_KEY = "completed-tours";

function getCompletedTours(): string[] {
  try {
    const stored = localStorage.getItem(COMPLETED_TOURS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function markTourCompleted(tourId: string) {
  const completed = getCompletedTours();
  if (!completed.includes(tourId)) {
    completed.push(tourId);
    localStorage.setItem(COMPLETED_TOURS_KEY, JSON.stringify(completed));
  }
}

function getTooltipPosition(
  targetRect: SpotlightRect,
  placement: "top" | "bottom" | "left" | "right",
  tooltipWidth: number,
  tooltipHeight: number
) {
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "top":
      top = targetRect.top - tooltipHeight - gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      break;
    case "bottom":
      top = targetRect.top + targetRect.height + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      break;
    case "left":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.left - tooltipWidth - gap;
      break;
    case "right":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.left + targetRect.width + gap;
      break;
  }

  top = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8));
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

  return { top, left };
}

export function GuidedTour({ steps, isOpen, onClose, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const step = steps[currentStep];

  const updateSpotlight = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      const padding = 4;
      setSpotlight({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    } else {
      setSpotlight(null);
    }
  }, [step]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      return;
    }
    updateSpotlight();
  }, [isOpen, currentStep, updateSpotlight]);

  useEffect(() => {
    if (!isOpen || !step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(updateSpotlight, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step, updateSpotlight]);

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => updateSpotlight();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen, updateSpotlight]);

  useEffect(() => {
    if (!spotlight || !tooltipRef.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const placement = step?.placement || "bottom";
    const pos = getTooltipPosition(spotlight, placement, tooltipRect.width, tooltipRect.height);
    setTooltipPos(pos);
  }, [spotlight, step]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, steps.length]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleFinish = useCallback(() => {
    onComplete();
    setCurrentStep(0);
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    onClose();
    setCurrentStep(0);
  }, [onClose]);

  if (!isOpen || !step) return null;

  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div
      data-testid="guided-tour-overlay"
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: "auto" }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-spotlight-mask)"
          style={{ pointerEvents: "auto" }}
          onClick={handleSkip}
        />
      </svg>

      {spotlight && (
        <div
          className="absolute rounded-md ring-2 ring-primary"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            pointerEvents: "none",
            zIndex: 10000,
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className="absolute z-[10001]"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          maxWidth: 360,
          minWidth: 280,
        }}
      >
        <Card className="shadow-lg border dark:border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base" data-testid="tour-step-title">
              {step.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p
              className="text-sm text-muted-foreground"
              data-testid="tour-step-description"
            >
              {step.description}
            </p>
            <p
              className="text-xs text-muted-foreground mt-2"
              data-testid="tour-step-counter"
            >
              Step {currentStep + 1} of {steps.length}
            </p>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-2 pt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              data-testid="tour-button-skip"
            >
              Skip
            </Button>
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBack}
                  data-testid="tour-button-back"
                >
                  Back
                </Button>
              )}
              {isLastStep ? (
                <Button
                  size="sm"
                  onClick={handleFinish}
                  data-testid="tour-button-finish"
                >
                  Finish
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleNext}
                  data-testid="tour-button-next"
                >
                  Next
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

const TOURS: { id: string; label: string; steps: TourStep[] }[] = [
  {
    id: "platform-overview",
    label: "Platform Overview",
    steps: [
      {
        targetSelector: '[data-testid="sidebar"]',
        title: "Sidebar Navigation",
        description:
          "Use the sidebar to navigate between different modules and features of the platform.",
        placement: "right",
      },
      {
        targetSelector: '[data-testid="dashboard-area"], [href="/dashboard"], main',
        title: "Dashboard Area",
        description:
          "This is your main dashboard where you can view key security metrics and alerts at a glance.",
        placement: "bottom",
      },
      {
        targetSelector: "main",
        title: "Main Content",
        description:
          "The main content area displays detailed views, data tables, charts, and reports depending on the selected module.",
        placement: "left",
      },
      {
        targetSelector: '[data-testid="global-search"], [data-testid="search-bar"], [data-testid="input-search"]',
        title: "Search Bar",
        description:
          "Quickly search for assets, incidents, users, and other entities across the platform.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-testid="theme-toggle"], [data-testid="button-theme-toggle"]',
        title: "Theme Toggle",
        description:
          "Switch between light and dark mode to match your preference.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "caasm-module",
    label: "CAASM Module",
    steps: [
      {
        targetSelector: '[data-testid="sidebar-caasm"], [href="/caasm"], [data-testid="nav-caasm"]',
        title: "CAASM Navigation",
        description:
          "Access the Cyber Asset Attack Surface Management module from the sidebar to explore your asset inventory.",
        placement: "right",
      },
      {
        targetSelector: '[data-testid="asset-overview"], [data-testid="caasm-overview"]',
        title: "Asset Overview",
        description:
          "View a comprehensive summary of all discovered assets including servers, endpoints, cloud resources, and applications.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-testid="charts-section"], .recharts-wrapper, [data-testid="caasm-charts"]',
        title: "Charts & Visualizations",
        description:
          "Interactive charts help you understand asset distribution, risk levels, and coverage gaps across your environment.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-testid="export-button"], [data-testid="button-export"], [data-testid="dashboard-export-bar"]',
        title: "Export Options",
        description:
          "Export asset data, charts, and reports in various formats for compliance reporting and stakeholder communication.",
        placement: "left",
      },
    ],
  },
  {
    id: "reports-ai",
    label: "Reports & AI",
    steps: [
      {
        targetSelector: '[data-testid="sidebar-reports"], [href="/reports"], [data-testid="nav-reports"]',
        title: "Reports Navigation",
        description:
          "Navigate to the Reports module to generate, view, and manage security reports.",
        placement: "right",
      },
      {
        targetSelector: '[data-testid="sidebar-ai-analyst"], [href="/ai-analyst"], [data-testid="nav-ai-analyst"]',
        title: "AI Analyst",
        description:
          "Access the AI-powered analyst to get intelligent insights and automated investigation assistance.",
        placement: "right",
      },
      {
        targetSelector: '[data-testid="report-generation"], [data-testid="button-generate-report"]',
        title: "Report Generation",
        description:
          "Generate comprehensive security reports with customizable templates, date ranges, and data sources.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-testid="ai-investigation"], [data-testid="ai-investigation-panel"]',
        title: "AI Investigation",
        description:
          "Leverage AI to investigate security incidents, correlate events, and receive actionable recommendations.",
        placement: "left",
      },
    ],
  },
];

export function TourLauncher() {
  const [activeTour, setActiveTour] = useState<typeof TOURS[number] | null>(null);

  const handleStartTour = (tour: typeof TOURS[number]) => {
    setActiveTour(tour);
  };

  const handleClose = () => {
    setActiveTour(null);
  };

  const handleComplete = () => {
    if (activeTour) {
      markTourCompleted(activeTour.id);
    }
    setActiveTour(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="tour-launcher-button"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="tour-launcher-menu">
          {TOURS.map((tour) => (
            <DropdownMenuItem
              key={tour.id}
              onClick={() => handleStartTour(tour)}
              data-testid={`tour-menu-item-${tour.id}`}
            >
              {tour.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activeTour && (
        <GuidedTour
          steps={activeTour.steps}
          isOpen={!!activeTour}
          onClose={handleClose}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}
