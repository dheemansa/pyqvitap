import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { pyqvitapClerkAppearance } from "@/config/clerk-theme";

/**
 * Fail-Safe Clerk Auth Provider Wrapper
 *
 * If NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured (e.g. during initial setup
 * or when AUTH_ENABLED=false), renders children cleanly without crashing the application.
 * When present, initializes Clerk with the PyqVitAp custom dark purple appearance.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={pyqvitapClerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
