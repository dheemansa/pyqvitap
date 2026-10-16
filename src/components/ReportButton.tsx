"use client";

import { useState } from "react";
import { FaFlag } from "react-icons/fa6";
import { Button } from "./ui/button";
import ReportTagModal from "./ReportTagModal";
import { usePaper } from "@/context/PaperContext";

interface ReportButtonProps {
  className?: string;
}

export default function ReportButton({ className }: ReportButtonProps = {}) {
  const { paperId, subject, exam, slot, year, semester } = usePaper();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={
          className ??
          "h-10 w-10 rounded bg-red-500 p-0 text-white transition hover:bg-red-600"
        }
        title="Report this paper"
      >
        <FaFlag className="text-sm" />
      </Button>

      <ReportTagModal
        paperId={paperId}
        subject={subject}
        exam={exam}
        slot={slot}
        year={year}
        semester={semester}
        open={open}
        setOpen={setOpen}
      />
    </>
  );
}
