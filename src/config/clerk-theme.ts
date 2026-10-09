import { dark } from "@clerk/themes";

/**
 * PyqVitAp Branded Clerk Appearance Configuration
 *
 * Visually matches PyqVitAp's dark purple design identity:
 * - Backgrounds: #070114 / #0f0926
 * - Primaries: #7c3aed (Violet-600) / #8b5cf6 (Violet-500)
 * - Accent gradients: linear-gradient(135deg, #7c3aed, #a855f7)
 * - Rounded cards: 16px radius
 * - Preserves Clerk's official branding as required
 */
export const pyqvitapClerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#8b5cf6",
    colorBackground: "#0f0926",
    colorInputBackground: "#181033",
    colorInputText: "#ffffff",
    colorText: "#ffffff",
    colorTextSecondary: "#9ca3af",
    colorDanger: "#ef4444",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  },
  elements: {
    card: {
      backgroundColor: "#0f0926",
      border: "1px solid rgba(139, 92, 246, 0.25)",
      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(139, 92, 246, 0.1)",
      borderRadius: "1rem",
    },
    headerTitle: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: "1.375rem",
    },
    headerSubtitle: {
      color: "#9ca3af",
      fontSize: "0.875rem",
    },
    formButtonPrimary: {
      background: "linear-gradient(135deg, #7c3aed, #9333ea)",
      color: "#ffffff",
      fontWeight: "600",
      boxShadow: "0 4px 14px 0 rgba(124, 58, 237, 0.4)",
      "&:hover": {
        background: "linear-gradient(135deg, #6d28d9, #7e22ce)",
      },
    },
    socialButtonsBlockButton: {
      backgroundColor: "#181033",
      border: "1px solid rgba(139, 92, 246, 0.2)",
      color: "#ffffff",
      "&:hover": {
        backgroundColor: "#231849",
        borderColor: "rgba(139, 92, 246, 0.4)",
      },
    },
    formFieldInput: {
      backgroundColor: "#181033",
      borderColor: "rgba(139, 92, 246, 0.2)",
      color: "#ffffff",
      "&:focus": {
        borderColor: "#8b5cf6",
        boxShadow: "0 0 0 2px rgba(139, 92, 246, 0.3)",
      },
    },
    footerActionLink: {
      color: "#a78bfa",
      "&:hover": {
        color: "#c4b5fd",
      },
    },
    identityPreviewText: {
      color: "#ffffff",
    },
    identityPreviewEditButtonIcon: {
      color: "#a78bfa",
    },
  },
};
