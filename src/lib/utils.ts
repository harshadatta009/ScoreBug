import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging Tailwind class names.
 *
 * Uses clsx for conditional/array logic and tailwind-merge to deduplicate
 * conflicting Tailwind utilities (e.g. `p-2` + `p-4` → `p-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
