"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Zap, Layers, Wallet, Droplets, Bot, Globe, Beaker, BarChart3, X } from "lucide-react";

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
    description: "HydroCoin (HYDRO) is a token on the XRPL blockchain. 1 HYDRO = 1 verified gallon of water restored. When retired (burned), it proves real water restoration was funded. Settlement runs through a real XRPL testnet AMM; the price and cap figures shown are an illustrative model, not a live market.",
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
    description: "Now you understand how x402GAL turns AI water consumption into verifiable restoration credits. Click 'Next' to enter the INFILTRATE ETHConf scavenger hunt.",
    icon: <Zap className="text-hydro-300" size={24} />,
    position: "center",
  },
];

export function OnboardingGuide({ isConnected, onComplete, forceShow }: OnboardingGuideProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Always start in tour mode on first load
    const timer = setTimeout(() => {
      setShowGuide(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [forceShow]);

  const scrollToTarget = useCallback(() => {
    const step = steps[currentStep];
    if (!step.targetSelector || step.position === "center") return;
    const el = document.querySelector(step.targetSelector);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentStep]);

  useEffect(() => {
    if (showGuide) {
      scrollToTarget();
    }
  }, [showGuide, currentStep, scrollToTarget]);

  const handleComplete = () => {
    localStorage.setItem("x402gal-guide-completed", "true");
    setShowGuide(false);
    onComplete();
    // Send user back to the scavenger hunt at end of tour
    window.location.href = "/infiltrateETHConf2026";
  };

  const handleSkip = () => {
    localStorage.setItem("x402gal-guide-skipped", "true");
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

  return (
    <>
      {/* Tooltip — clean bottom sheet guide without spotlight overlay */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={tooltipRef}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22 }}
          className="fixed z-[70] pointer-events-auto"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
          }}
        >
          {/* Inner wrapper constrains width on tablet/desktop */}
          <div className="mx-auto w-full sm:max-w-md sm:mb-6 sm:rounded-2xl sm:mx-auto">
            <div
              className="bg-slate-900/90 border border-slate-700/80 p-4 rounded-t-2xl rounded-b-none sm:rounded-2xl backdrop-blur-md"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            >
              {/* Drag handle */}
              <div className="mb-3 flex justify-center sm:hidden">
                <div className="h-1 w-10 rounded-full bg-slate-600" />
              </div>
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hydro-400/30 bg-hydro-500/10 sm:h-10 sm:w-10">
                  {currentStepData.icon}
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white sm:text-base">
                    {currentStepData.title}
                  </h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {currentStep + 1} / {steps.length}
                  </p>
                </div>
              </div>
              {/* Close button */}
              <button
                onClick={handleSkip}
                className="inline-flex items-center justify-center rounded-lg border border-edge bg-panel/50 p-2 text-slate-400 transition hover:border-hydro-400/30 hover:text-white"
                aria-label="Skip tour"
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
                    index <= currentStep ? "bg-cyan-500" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <p className="mb-4 text-xs leading-relaxed text-slate-300 sm:mb-5 sm:text-sm">
              {currentStepData.description}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-end">
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
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-cyan-400"
                >
                  {isLastStep ? "Got it!" : "Next"}
                  {!isLastStep && <ArrowRight size={12} />}
                </button>
              </div>
            </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
