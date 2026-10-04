"use client";

import React, { useEffect, useState } from "react";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";

export default function MaintenanceScreen() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setWasmUrl("/assets/maintenance/dotlottie-player.wasm");
    setIsClient(true);
  }, []);

  return (
    <div className="flex w-full flex-col items-center justify-center px-4 py-8 sm:py-16 text-center">
      <div className="w-full max-w-xl flex flex-col items-center">
        {/* Lottie Maintenance Animation */}
        <div className="w-full max-w-[340px] sm:max-w-[400px] md:max-w-[460px] aspect-[4/3] flex items-center justify-center mb-4 sm:mb-6 overflow-hidden">
          {isClient ? (
            <DotLottieReact
              src="/assets/maintenance/iGV0il5M4W.lottie"
              loop
              autoplay
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full" aria-hidden="true" />
          )}
        </div>

        {/* Main Heading */}
        <h1 className="font-jost text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
          Under Maintenance
        </h1>

        {/* Main Message */}
        <p className="max-w-md sm:max-w-lg text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
          PyqVitAp is temporarily offline while we work on important improvements to the platform.
        </p>

        {/* Why are we doing this? */}
        <div className="w-full max-w-md sm:max-w-lg text-center mb-8">
          <h2 className="font-jost text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2">
            Why are we doing this?
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            We’re using this maintenance period to fix underlying issues, improve performance, and strengthen reliability. We’re also making infrastructure improvements to help PyqVitAp handle more students, support a growing collection of question papers, and provide a smoother experience.
          </p>
        </div>

        {/* Return Section Card */}
        <div className="w-full max-w-sm rounded-2xl border border-purple-300/60 bg-white/70 px-6 py-5 shadow-sm backdrop-blur-sm dark:border-[#3A3745] dark:bg-[#130E1F]/80 mb-6 transition-colors">
          <h3 className="text-xs uppercase tracking-widest font-bold text-purple-700 dark:text-purple-300 mb-1.5">
            Expected Return
          </h3>
          <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Before 9 October 2026
          </p>
        </div>

        {/* Closing Notice & Apology */}
        <p className="text-xs sm:text-sm md:text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
          We’re working to get everything back up as soon as possible. Thank you for your patience and support. 💜
        </p>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          We’re sorry for any inconvenience caused.
        </p>
      </div>
    </div>
  );
}

