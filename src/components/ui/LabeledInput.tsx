"use client";

import React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
}

const LabeledInput = ({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  maxLength,
  className = "",
  inputClassName = "",
}: LabeledInputProps) => {
  return (
    <Field label={label} className={className}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        maxLength={maxLength}
        className={inputClassName}
      />
    </Field>
  );
};

export default LabeledInput;
