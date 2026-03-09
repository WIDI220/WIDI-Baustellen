import { cn } from "@/lib/utils";
import { forwardRef } from "react";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'default'|'outline'|'destructive'|'ghost'; size?: 'sm'|'md'|'lg'; }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant='default', size='md', ...props }, ref) => {
  const base = "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const variants = { default: "bg-[#1e3a5f] text-white hover:bg-[#162d4a]", outline: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50", destructive: "bg-red-500 text-white hover:bg-red-600", ghost: "hover:bg-gray-100 text-gray-700" };
  const sizes = { sm: "h-8 px-3 text-xs rounded-lg", md: "h-10 px-4 text-sm rounded-xl", lg: "h-11 px-6 text-sm rounded-xl" };
  return <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
});
Button.displayName = "Button";
