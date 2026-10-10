"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <div className="relative">
    <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af] pointer-events-none">🔒</span>
    <input {...props} type={visible ? "text" : "password"} />
    <button type="button" onClick={() => setVisible(!visible)} className="absolute right-[10px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[#9ca3af] text-[15px]" aria-label={visible ? "Hide password" : "Show password"}>
      <Icon size={15} aria-hidden="true" />
    </button>
  </div>;
}
