import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none";
    const variants = {
      default: "text-white shadow-sm active:scale-[.98]",
      outline: "border bg-white active:scale-[.98]",
      ghost: "hover:bg-gray-100 active:scale-[.98]",
      danger: "text-white active:scale-[.98]",
    };
    const sizes = { sm: "text-xs px-3 py-1.5 gap-1.5", md: "text-sm px-4 py-2 gap-2", lg: "text-sm px-5 py-2.5 gap-2" };
    const colors = {
      default: { background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1d3a 100%)', boxShadow: '0 1px 3px rgba(15,31,61,.3)' },
      danger: { background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 1px 3px rgba(239,68,68,.3)' },
    };
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        style={(variant === 'default' || variant === 'danger') ? colors[variant] : variant === 'outline' ? {borderColor:'#e5e9f2', color:'#1e3a5f'} : undefined}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
