"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Zap, Layers, Wallet, Droplets, Bot, Globe, Beaker, BarChart3 } from "lucide-react";

interface OnboardingGuideProps {
  isConnected: boolean;
  onComplete: () => void;
  forceShow?: boolean;
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector?: string;
  position?: "top" | "bottom" | "center";
}

const steps: Step[] = [
  {
    id: "welcome",
    title: "Welcome to x402GAL",
    description: "This platform shows how AI agents can automatically pay for their water footprint. Let\u2019s walk through each section so you understand how it works \u2014 no wallet or crypto experience needed.",
    icon: <Globe className="text-hydro-300" size={24} />,
    position: "center",
  },
  {
    id: "hero",
    title: "The Problem & Solution",
    description: "Every AI query consumes water for data center cooling. x402GAL measures that footprint and converts it into a verifiable water-restoration payment \u2014 automatically, per call.",
    icon: <Droplets className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='metrics']",
    position: "bottom",
  },
  {
    id: "hydrocoin",
    title: "HydroCoin \u2014 The Water Credit",
    description: "HydroCoin (HYDRO) is a token on the XRPL blockchain. 1 HYDRO = 1 verified gallon of water restored. When retired (burned), it proves real water restoration was funded. The price shown here tracks simulated market dynamics.",
    icon: <Droplets className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='hydrocoin']",
    position: "bottom",
  },
  {
    id: "agent-console",
    title: "Agent Console",
    description: "This panel simulates AI agents making paid API calls. In the real world, agents are autonomous programs (like chatbots or trading bots) that auto-pay using the x402 protocol. Connect a wallet to try it yourself, or just watch the metrics.",
    icon: <Bot className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='agent-section']",
    position: "top",
  },
  {
    id: "batch-panel",
    title: "Batch & Settlement",
    description: "Individual calls cost fractions of a cent \u2014 too small to settle one by one. x402GAL batches 100 calls together, then settles them in a single XRPL transaction. Click \u2018Settle on XRPL now\u2019 to flush early (requires wallet).",
    icon: <Layers className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='batch-panel']",
    position: "top",
  },
  {
    id: "chart",
    title: "Live Offset Chart",
    description: "This chart updates every 2.5 seconds showing cumulative liters of water restored. Each spike represents a settlement \u2014 a batch of AI calls converted into verified water credits on XRPL.",
    icon: <BarChart3 className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='price-chart']",
    position: "bottom",
  },
  {
    id: "methodology",
    title: "Footprint Methodology",
    description: "The formula (W_site = WUE \u00d7 energy \u00d7 boundary) calculates exactly how much water each AI call uses. It\u2019s published with every payment so anyone can independently verify the math. Based on Green Grid WUE standards and real data center disclosures.",
    icon: <Beaker className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='methodology']",
    position: "top",
  },
  {
    id: "wallet-info",
    title: "Wallet (Optional)",
    description: "Connecting a wallet lets you interact with the demo: send queries, flush batches, and see settlements. It uses testnet funds (no real money). If you don\u2019t have a wallet, that\u2019s fine \u2014 you can still explore the dashboard and learn how the system works.",
    icon: <Wallet className="text-hydro-300" size={24} />,
    position: "center",
  },
  {
    id: "complete",
    title: "You\u2019re All Set!",
    description: "Now you understand how x402GAL turns AI water consumption into verifiable restoration credits. Explore the dashboard, or click Tour again anytime to revisit this guide.",
    icon: <Zap className="text-hydro-300" size={24} />,
    position: "center",
  },
];

export function OnboardingGuide({ isConnected, onComplete, forceShow }: OnboardingGuideProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: "above" | "below" | "center" }>({ top: 0, left: 0, placement: "center" });
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Always start in tour mode on first load
    const timer = setTimeout(() => {
      setShowGuide(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [forceShow]);

  const positionTooltip = useCallback(() => {
    const step = steps[currentStep];
    if (!step.targetSelector || step.position === "center") {
      setSpotlightRect(null);
      setTooltipPos({ top: 0, left: 0, placement: "center" });
      return;
    }

    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setSpotlightRect(null);
      setTooltipPos({ top: 0, left: 0, placement: "center" });
      return;
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Wait for scroll to finish before measuring
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);

      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const isMobile = vw < 640;
      const tooltipHeight = isMobile ? 260 : 300;
      const padding = 12;

      const tooltipWidth = isMobile ? vw - 32 : 400;

      // Clamp horizontal: align tooltip center with element center, but keep in viewport
      const elCenterX = rect.left + rect.width / 2;
      const clampedLeft = Math.min(
        Math.max(elCenterX, tooltipWidth / 2 + padding),
        vw - tooltipWidth / 2 - padding
      );

      // On mobile, always place tooltip at bottom of screen as a drawer
      if (isMobile) {
        setTooltipPos({
          top: vh - tooltipHeight - padding,
          left: clampedLeft,
          placement: "below",
        });
        return;
      }

      // Desktop: prefer below, but go above if no room
      if (step.position === "top" || rect.bottom + tooltipHeight + padding > vh) {
        setTooltipPos({
          top: Math.max(padding, rect.top - tooltipHeight - padding),
          left: clampedLeft,
          placement: "above",
        });
      } else {
        setTooltipPos({
          top: rect.bottom + padding,
          left: clampedLeft,
          placement: "below",
        });
      }
    }, 400);
  }, [currentStep]);

  useEffect(() => {
    if (showGuide) {
      positionTooltip();
      const handleResize = () => positionTooltip();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [showGuide, currentStep, positionTooltip]);

  const handleSkip = () => {
    localStorage.setItem("x402gal-guide-skipped", "true");
    setShowGuide(false);
    onComplete();
  };

  const handleComplete = () => {
    localStorage.setItem("x402gal-guide-completed", "true");
    setShowGuide(false);
    onComplete();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (!showGuide) return null;

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const isCentered = tooltipPos.placement === "center";

  return (
    <>
      {/* Spotlight overlay with cutout */}
      <div className="fixed inset-0 z-[60] pointer-events-none">
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlightRect && (
                <rect
                  x={spotlightRect.left - 8}
                  y={spotlightRect.top - 8}
                  width={spotlightRect.width + 16}
                  height={spotlightRect.height + 16}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(0,4,9,0.85)"
            mask="url(#spotlight-mask)"
            className="pointer-events-auto cursor-pointer"
            onClick={handleSkip}
          />
        </svg>

        {/* Spotlight border ring */}
        {spotlightRect && (
          <div
            className="absolute rounded-xl border-2 border-hydro-400/70 shadow-glow pointer-events-none transition-all duration-400"
            style={{
              top: spotlightRect.top - 8,
              left: spotlightRect.left - 8,
              width: spotlightRect.width + 16,
              height: spotlightRect.height + 16,
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={tooltipRef}
          initial={{ opacity: 0, y: isCentered ? 20 : tooltipPos.placement === "above" ? 10 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed z-[70] pointer-events-auto"
          style={isCentered ? {
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(calc(100% - 2rem), 28rem)",
          } : {
            top: tooltipPos.top,
            left: "1rem",
            right: "1rem",
            maxWidth: "28rem",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div className="glass-strong rounded-2xl border border-hydro-400/30 p-5 shadow-glow-lg">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hydro-400/30 bg-hydro-500/10">
                  {currentStepData.icon}
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    {currentStepData.title}
                  </h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {currentStep + 1} / {steps.length}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSkip}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-panel/50 hover:text-white"
                title="Close tour"
              >
                <X size={16} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mb-4 flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    index <= currentStep ? "bg-hydro-400" : "bg-hydro-400/20"
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <p className="mb-5 text-sm leading-relaxed text-slate-300">
              {currentStepData.description}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-[11px] text-slate-500 transition hover:text-slate-300"
              >
                End tour
              </button>
              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <button
                    onClick={handlePrev}
                    className="inline-flex items-center gap-1 rounded-lg border border-edge bg-panel/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-hydro-400/30 hover:text-white"
                  >
                    <ArrowLeft size={12} />
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1 rounded-lg bg-hydro-gradient px-4 py-1.5 text-xs font-semibold text-abyss shadow-glow transition hover:brightness-110"
                >
                  {isLastStep ? "Got it!" : "Next"}
                  {!isLastStep && <ArrowRight size={12} />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
