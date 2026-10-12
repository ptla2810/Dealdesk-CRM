import type { Option } from "@/components/forms/fields";

export const userOptions = (users: { id: string; name: string; role?: { name: string } }[]): Option[] =>
  users.map((u) => ({ value: u.id, label: u.name, hint: u.role?.name }));

export const accountOptionsOf = (accounts: { id: string; number: string; name: string; city?: string | null }[]): Option[] =>
  accounts.map((a) => ({ value: a.id, label: `${a.number} · ${a.name}`, hint: a.city ?? undefined }));
