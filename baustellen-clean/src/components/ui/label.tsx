import { cn } from "@/lib/utils";
export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-xs font-medium text-gray-500 mb-1 block", className)} {...props} />
);
