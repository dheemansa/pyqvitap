"use client";

import { useEffect, Suspense } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import PostHogPageView from "./PostHogPageView";
import { initGlobalErrorTelemetry } from "@/lib/telemetry";

if (typeof window !== "undefined") {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (apiKey && !posthog.__loaded) {
    try {
      posthog.init(apiKey, {
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false, // Explicitly handled via PostHogPageView
        capture_pageleave: true,
        autocapture: false, // Non-intrusive: prevent DOM clutter & unwanted overhead
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        feature_flag_request_timeout_ms: 3000,
        loaded: (ph) => {
          if (process.env.NODE_ENV === "development") {
            ph.debug(false);
          }
        },
      });
    } catch {
      // Fail-open: initialization failures must never crash the application
    }
  }
}

interface PostHogProviderWrapperProps {
  children: React.ReactNode;
}

export default function PostHogProviderWrapper({
  children,
}: PostHogProviderWrapperProps) {
  useEffect(() => {
    // Initialize global client error and unhandled rejection listeners
    initGlobalErrorTelemetry();
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
