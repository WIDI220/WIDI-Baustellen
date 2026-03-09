import { cn } from "@/lib/utils";
import { forwardRef } from "react";
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-colors placeholder:text-gray-400 min-h-[80px] resize-none", className)} {...props} />
));
Textarea.displayName = "Textarea";
