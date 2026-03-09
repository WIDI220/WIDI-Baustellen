import { cn } from "@/lib/utils";
interface SelectProps { value: string; onValueChange: (v: string) => void; children: React.ReactNode; className?: string; }
export function Select({ value, onValueChange, children, className }: SelectProps) {
  return <select value={value} onChange={e => onValueChange(e.target.value)} className={cn("w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-colors h-10", className)}>{children}</select>;
}
export function SelectOption({ value, children }: { value: string; children: React.ReactNode }) {
  return <option value={value}>{children}</option>;
}
