"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export interface PdfViewerClientWrapperProps {
  url: string;
  name: string;
  className?: string;
  height?: string;
  hideControls?: boolean;
  backgroundColor?: string;
  hideScrollbar?: boolean;
  isolateFromTheme?: boolean;
  onReadingModeChange?: (isReadingMode: boolean) => void;
}

const LOADING_MESSAGES = [
  "Loading document",
  "Preparing pages",
  "Almost there",
];

function ViewerLoadingFallback({
  backgroundColor = "#070114",
  textColor = "rgba(255,255,255,0.5)",
}: {
  backgroundColor?: string;
  textColor?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev,
      );
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex h-dvh w-full flex-col items-center justify-center gap-3"
      style={{ backgroundColor }}
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-white" />
      <span
        className="text-sm tracking-wide transition-opacity duration-300"
        style={{ color: textColor }}
      >
        {LOADING_MESSAGES[index]}
      </span>
    </div>
  );
}

const PDFViewer = dynamic(() => import("@/components/newPdfViewer"), {
  ssr: false,
  loading: () => <ViewerLoadingFallback />,
});

export default function PdfViewerClientWrapper(
  props: PdfViewerClientWrapperProps,
) {
  return <PDFViewer {...props} />;
}
