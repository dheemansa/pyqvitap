"use client";

import React, { useEffect, useState } from "react";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";

export default function MaintenanceScreen() {
  const [isClient, setIsClient] = useState(false);
  const [isLottieReady, setIsLottieReady] = useState(false);

  useEffect(() => {
    setWasmUrl("/assets/maintenance/dotlottie-player.wasm");
    setIsClient(true);
  }, []);

  const handleDotLottieRef = (dotLottie: any) => {
    if (!dotLottie) return;

    const onReady = () => {
      setIsLottieReady(true);
    };

    dotLottie.addEventListener("render", onReady);
    dotLottie.addEventListener("play", onReady);

    if (dotLottie.isLoaded || dotLottie.isReady || dotLottie.isPlaying) {
      setIsLottieReady(true);
    }
  };

  return (
    <div className="flex w-full flex-col items-center justify-center px-4 py-8 text-center sm:py-16">
      <div className="flex w-full max-w-xl flex-col items-center">
        {/* Lottie Maintenance Animation with Instant Static Poster Fallback */}
        <div className="relative mb-4 flex aspect-[4/3] w-full max-w-[340px] items-center justify-center overflow-hidden sm:mb-6 sm:max-w-[400px] md:max-w-[460px]">
          {/* Instant SSR & FCP Poster */}
          <img
            src="/assets/maintenance/poster.webp"
            alt="PyqVitAp Under Maintenance"
            width={460}
            height={345}
            fetchPriority="high"
            className={`absolute inset-0 z-0 h-full w-full object-contain transition-opacity duration-500 ease-in-out ${
              isLottieReady ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          />

          {/* Active Lottie Animation */}
          {isClient && (
            <div
              className={`relative z-10 h-full w-full transition-opacity duration-500 ease-in-out ${
                isLottieReady ? "opacity-100" : "opacity-0"
              }`}
            >
              <DotLottieReact
                src="/assets/maintenance/iGV0il5M4W.lottie"
                loop
                autoplay
                dotLottieRefCallback={handleDotLottieRef}
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        {/* Main Heading */}
        <h1 className="mb-4 font-jost text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl md:text-5xl">
          Under Maintenance
        </h1>

        {/* Main Message */}
        <p className="mb-6 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:max-w-lg sm:text-base md:text-lg">
          PyqVitAp is temporarily offline while we work on important
          improvements to the platform.
        </p>

        {/* Why are we doing this? */}
        <div className="mb-8 w-full max-w-md text-center sm:max-w-lg">
          <h2 className="mb-2 font-jost text-base font-bold text-gray-900 dark:text-white sm:text-lg">
            Why are we doing this?
          </h2>
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
            We’re using this maintenance period to fix underlying issues,
            improve performance, and strengthen reliability. We’re also making
            infrastructure improvements to help PyqVitAp handle more students,
            support a growing collection of question papers, and provide a
            smoother experience.
          </p>
        </div>

        {/* Return Section Card */}
        <div className="mb-6 w-full max-w-sm rounded-2xl border border-purple-300/60 bg-white/70 px-6 py-5 shadow-sm backdrop-blur-sm transition-colors dark:border-[#3A3745] dark:bg-[#130E1F]/80">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300">
            Expected Return
          </h3>
          <p className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
            Before 9 October 2026
          </p>
        </div>

        {/* Closing Notice & Apology */}
        <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm md:text-base">
          We’re working to get everything back up as soon as possible. Thank you
          for your patience and support. 💜
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
          We’re sorry for any inconvenience caused.
        </p>
      </div>
    </div>
  );
}
