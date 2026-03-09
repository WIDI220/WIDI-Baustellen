import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('de-DE') : '–';
