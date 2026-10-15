/** Product branding. Override NEXT_PUBLIC_APP_NAME to rename the product without code changes. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "DealDesk";
/** Name of the built-in conversational assistant. */
export const ASSISTANT_NAME = process.env.NEXT_PUBLIC_ASSISTANT_NAME?.trim() || "Zeni";
export const APP_URL = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
