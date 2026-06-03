"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Zap, Layers, Send, Wallet, Droplets, Bot } from "lucide-react";

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
  action?: string;
}

const steps: Step[] = [
  {
    id: "welcome",
    title: "Welcome to x402GAL",
    description: "You're now connected! Let's walk through how to use the water-offset simulation platform.",
    icon: <Wallet className="text-hydro-300" size={24} />,
  },
  {
    id: "agent-session",
    title: "Your Agent Session",
    description: "This is your personal AI agent. It has a unique ID tied to your wallet and operates on your selected chain. Your agent will handle all x402 payments for you.",
    icon: <Bot className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='agent-session']",
  },
  {
    id: "send-query",
    title: "Send a Paid Query",
    description: "Click 'Send 1 paid query' to make your first AI inference request. Each query costs about $0.01 in USDC and automatically calculates its water footprint.",
    icon: <Send className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='send-query']",
    action: "Try sending a query now",
  },
  {
    id: "burst-mode",
    title: "Burst Mode (100 Queries)",
    description: "Click 'Burst 100 → flush' to send 100 queries at once. This demonstrates batch processing where multiple requests are aggregated before settlement.",
    icon: <Zap className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='burst-mode']",
    action: "Try burst mode",
  },
  {
    id: "batch-panel",
    title: "Pending Batch",
    description: "Watch the batch counter fill up. When it reaches 100 calls (or you manually flush), the system will settle all payments on XRPL, swapping USDC for HydroCoin.",
    icon: <Layers className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='batch-panel']",
  },
  {
    id: "settlement",
    title: "XRPL Settlement",
    description: "After flushing, you'll see the XRPL settlement details. The system swaps USDC for HydroCoin and retires it as a water-restoration credit. Every 1 HYDRO = 1 gallon of water restored.",
    icon: <Droplets className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='settlement']",
  },
  {
    id: "top-up",
    title: "Top Up Your Agent",
    description: "If your agent runs low on USDC, click '+$100 USDC (top up agent wallet)' to add more funds. Your agent needs funds to continue making paid queries.",
    icon: <Wallet className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='top-up']",
  },
  {
    id: "metrics",
    title: "Track Your Impact",
    description: "Watch your total water restored, calls served, and HYDRO retired in real-time. The live chart shows cumulative liters offset over time.",
    icon: <Droplets className="text-hydro-300" size={24} />,
    targetSelector: "[data-guide='metrics']",
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "That's it! You now know how to use x402GAL. Start exploring, send queries, and watch your water offset grow. Every AI inference now has a purpose.",
    icon: <Zap className="text-hydro-300" size={24} />,
  },
];

export function OnboardingGuide({ isConnected, onComplete, forceShow }: OnboardingGuideProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check localStorage for guide status
    const guideCompleted = localStorage.getItem("x402gal-guide-completed");
    const guideSkipped = localStorage.getItem("x402gal-guide-skipped");
    const hasSeenGuide = !!(guideCompleted || guideSkipped);
    
    // Show guide when user connects for the first time, or if forceShow is set
    if ((isConnected && !hasSeenGuide) || forceShow) {
      const timer = setTimeout(() => {
        setShowGuide(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isConnected, forceShow]);

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

  const handleStepClick = (index: number) => {
    setCurrentStep(index);
  };

  if (!showGuide) return null;

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <AnimatePresence>
      {showGuide && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-abyss/90 backdrop-blur-sm"
            onClick={handleSkip}
          />

          {/* Guide Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2"
          >
            <div className="glass-strong mx-4 rounded-2xl border border-hydro-400/30 p-6 shadow-glow-lg">
              {/* Header */}
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-hydro-400/30 bg-hydro-500/10">
                    {currentStepData.icon}
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">
                      {currentStepData.title}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Step {currentStep + 1} of {steps.length}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSkip}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-panel/50 hover:text-white"
                  title="Skip tour"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Progress dots */}
              <div className="mb-6 flex gap-1.5">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => handleStepClick(index)}
                    className={`h-1.5 flex-1 rounded-full transition-all ${
                      index <= currentStep
                        ? "bg-hydro-400"
                        : "bg-hydro-400/20"
                    }`}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="mb-6">
                <p className="text-sm leading-relaxed text-slate-300">
                  {currentStepData.description}
                </p>
                {currentStepData.action && (
                  <p className="mt-3 text-xs text-hydro-300">
                    <span className="font-semibold">Action:</span> {currentStepData.action}
                  </p>
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSkip}
                  className="text-xs text-slate-500 transition hover:text-slate-300"
                >
                  Skip tour
                </button>

                <div className="flex items-center gap-2">
                  {!isFirstStep && (
                    <button
                      onClick={handlePrev}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel/50 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-hydro-400/30 hover:text-white"
                    >
                      <ArrowLeft size={14} />
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-hydro-gradient px-4 py-2 text-xs font-semibold text-abyss shadow-glow transition hover:brightness-110"
                  >
                    {isLastStep ? "Finish" : "Next"}
                    {!isLastStep && <ArrowRight size={14} />}
                  </button>
                </div>
              </div>

              {/* Don't show again checkbox */}
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dont-show-again"
                  className="h-3.5 w-3.5 cursor-pointer rounded border-hydro-400/30 bg-ink/60 text-hydro-400 focus:ring-hydro-400"
                  onChange={(e) => {
                    if (e.target.checked) {
                      localStorage.setItem("x402gal-guide-skipped", "true");
                    } else {
                      localStorage.removeItem("x402gal-guide-skipped");
                    }
                  }}
                />
                <label
                  htmlFor="dont-show-again"
                  className="cursor-pointer text-xs text-slate-500"
                >
                  Don&apos;t show this guide again
                </label>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
