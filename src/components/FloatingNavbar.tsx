"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ChevronDown, UploadIcon, Github, Pin, ArrowUpRight, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import ModeToggle from "./toggle-theme";
import { MAINTENANCE_MODE } from "@/config/maintenance";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import PinnedModal from "./ui/PinnedModal";
import RequestModal from "./ui/RequestModal";

interface Props {
  onNavigate: () => void;
}

function MobileThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? (resolvedTheme || theme) === "dark" : true;

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3A3745] bg-[#e8e9ff] text-gray-700 shadow-lg transition-transform duration-200 hover:scale-105 hover:bg-slate-50 active:scale-95 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#562EE7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#B2B8FF] dark:bg-[#1E1B2E] dark:text-white dark:hover:bg-[#2A263D] dark:focus-visible:ring-[#7480FF] dark:focus-visible:ring-offset-[#130E1F] pointer-events-auto after:absolute after:-inset-1 after:content-['']"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none" />
      )}
    </button>
  );
}

export default function FloatingNavbar({ onNavigate }: Props) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 pointer-events-none shrink-0">
      <MobileThemeToggle />
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3A3745] bg-[#e8e9ff] text-gray-700 hover:bg-slate-50 dark:bg-[#1E1B2E] dark:text-white dark:hover:bg-[#2A263D] shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 pointer-events-auto motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#562EE7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#B2B8FF] dark:focus-visible:ring-[#7480FF] dark:focus-visible:ring-offset-[#130E1F] after:absolute after:-inset-1 after:content-['']"
            aria-label="Toggle dropdown"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${dropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="xl:hidden mt-2 p-1.5 w-48 space-y-0.5 rounded-xl 
          border border-[#3A3745] shadow-xl backdrop-blur-md transition-colors
          bg-[#e8e9ff] text-gray-800 
          dark:bg-[#181528] dark:text-white dark:border-[#3A3745]"
          align="end"
        >
          <DropdownMenuItem asChild className="rounded-lg px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-[#1F2A3D] dark:focus:bg-[#1F2A3D] cursor-pointer">
            <Link
              href={MAINTENANCE_MODE ? "/upload" : (pathname === "/upload" ? "/" : "/upload")}
              onClick={() => {
                setDropdownOpen(false);
                onNavigate();
              }}
              className="flex w-full items-center gap-2.5 bg-transparent hover:bg-transparent"
            >
              <UploadIcon className="h-4 w-4" />
              <span className="text-xs font-medium">
                {MAINTENANCE_MODE ? "Upload Papers" : (pathname === "/upload" ? "Search Papers" : "Upload Papers")}
              </span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            asChild={MAINTENANCE_MODE}
            onSelect={(e) => {
              if (MAINTENANCE_MODE) {
                setDropdownOpen(false);
                onNavigate();
              } else {
                e.preventDefault();
              }
            }}
            className="rounded-lg px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-[#1F2A3D] dark:focus:bg-[#1F2A3D] cursor-pointer"
          >
            {MAINTENANCE_MODE ? (
              <Link
                href="/pinned"
                className="flex w-full items-center gap-2.5 bg-transparent hover:bg-transparent"
              >
                <Pin className="h-4 w-4" />
                <span className="text-xs font-medium">Pin Subjects</span>
              </Link>
            ) : (
              <PinnedModal />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            asChild={MAINTENANCE_MODE}
            onSelect={(e) => {
              if (MAINTENANCE_MODE) {
                setDropdownOpen(false);
                onNavigate();
              } else {
                e.preventDefault();
              }
            }}
            className="rounded-lg px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-[#1F2A3D] dark:focus:bg-[#1F2A3D] cursor-pointer"
          >
            {MAINTENANCE_MODE ? (
              <Link
                href="/request"
                className="flex w-full items-center gap-2.5 bg-transparent hover:bg-transparent"
              >
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-xs font-medium">Request Paper</span>
              </Link>
            ) : (
              <RequestModal />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem asChild className="rounded-lg px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-[#1F2A3D] dark:focus:bg-[#1F2A3D] cursor-pointer">
            <a
              href="https://github.com/sabarishwaran-v/pyqvitap"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2.5 bg-transparent hover:bg-transparent"
            >
              <Github className="h-4 w-4" />
              <span className="text-xs font-medium">⭐ Star us on GitHub</span>
            </a>
          </DropdownMenuItem>

          <div className="pt-1 mt-1 border-t border-gray-300 dark:border-[#2E2B3E] flex items-center justify-between px-2.5 py-1">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Theme</span>
            <div className="border border-gray-300 dark:border-[#3A3745] rounded-full p-0.5 scale-90">
              <ModeToggle />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
