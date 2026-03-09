import { cn } from "@/lib/utils";
export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("w-full bg-gray-100 rounded-full overflow-hidden", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value,100)}%`, background: color || '#1e3a5f' }} />
    </div>
  );
}
