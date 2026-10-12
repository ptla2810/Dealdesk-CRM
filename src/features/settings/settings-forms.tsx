"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckboxField, SelectField, TextField, type Option } from "@/components/forms/fields";
import { FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { StatusBadge } from "@/components/data/status-badge";
import {
  categorySchema,
  changePasswordSchema,
  leadSourceSchema,
  organizationSchema,
  profileSchema,
  roleCreateSchema,
  taxRateSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation/settings";
import type { ActionResult } from "@/lib/validation/common";
import { PERMISSIONS, PERMISSION_MODULES, type PermissionKey } from "@/lib/permissions";
import { COMMON_CURRENCIES, ORDER_STATUSES, ORDER_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  addCategoryAction,
  addLeadSourceAction,
  addTaxRateAction,
  changePasswordAction,
  createRoleAction,
  createUserAction,
  toggleLeadSourceAction,
  toggleTaxRateAction,
  updateOrganizationAction,
  updateProfileAction,
  updateRolePermissionsAction,
  updateUserAction,
  updateWorkflowAction,
} from "@/app/(app)/settings/actions";
import { signOutAction } from "@/app/(auth)/actions";

/** Small helper: a form bound to a schema and an action, rendered in a card or dialog. */
function useSchemaForm<V extends FieldValues>(
  resolver: Resolver<V>,
  defaults: V,
  action: (v: V) => Promise<ActionResult<unknown>>,
  message: string,
  onDone?: (form: UseFormReturn<V>) => void,
) {
  const form = useForm<V>({ resolver, defaultValues: defaults as DefaultValues<V> });
  const server = useServerForm(form, action, { successMessage: message, onSuccess: () => onDone?.(form) });
  return { form, ...server };
}
const r = <S extends z.ZodType>(schema: S) => zodResolver(schema as never) as unknown as Resolver<z.input<S> & FieldValues>;

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

// ─── Profile ────────────────────────────────────────────────────────────────

export function ProfileForm({ defaults }: { defaults: z.input<typeof profileSchema> }) {
  const { form, submit, formError } = useSchemaForm(r(profileSchema), defaults, updateProfileAction, "Profile updated");
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormErrorBanner message={formError} />
        <TextField name="name" label="Full name" required />
        <TextField name="jobTitle" label="Job title" />
        <TextField name="phone" label="Phone" type="tel" />
        <div className="sm:col-span-2"><SubmitButton pending={form.formState.isSubmitting}>Save profile</SubmitButton></div>
      </form>
    </FormProvider>
  );
}

export function PasswordForm() {
  const { form, submit, formError } = useSchemaForm(r(changePasswordSchema), { currentPassword: "", newPassword: "", confirmPassword: "" }, changePasswordAction, "Password changed — please sign in again", () => {
    setTimeout(() => signOutAction(), 800);
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormErrorBanner message={formError} />
        <TextField name="currentPassword" label="Current password" type="password" required autoComplete="current-password" className="sm:col-span-2" />
        <TextField name="newPassword" label="New password" type="password" required autoComplete="new-password" description="10+ characters with upper- and lowercase letters and a number." />
        <TextField name="confirmPassword" label="Confirm new password" type="password" required autoComplete="new-password" />
        <p className="text-xs text-muted-foreground sm:col-span-2">Changing your password signs you out of all sessions.</p>
        <div className="sm:col-span-2"><SubmitButton pending={form.formState.isSubmitting}>Change password</SubmitButton></div>
      </form>
    </FormProvider>
  );
}

// ─── Users ──────────────────────────────────────────────────────────────────

export function CreateUserDialog({ roles }: { roles: Option[] }) {
  const [open, setOpen] = useState(false);
  const defaults = { name: "", email: "", username: "", roleId: roles[0]?.value ?? "", jobTitle: "", password: "" };
  const { form, submit, formError } = useSchemaForm(r(userCreateSchema), defaults, createUserAction, "User created", () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> Add user</Button></DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>Share the temporary password securely; the user can change it under Profile. Google/SSO sign-in works once the email matches.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Full name" required />
              <TextField name="email" label="Work email" type="email" required />
              <TextField name="username" label="Username (optional)" />
              <TextField name="jobTitle" label="Job title" />
              <SelectField name="roleId" label="Role" required options={roles} />
              <TextField name="password" label="Temporary password" type="password" required autoComplete="new-password" />
            </div>
            <DialogFooter><SubmitButton pending={form.formState.isSubmitting}>Create user</SubmitButton></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({ user, roles, isSelf }: { user: { id: string; name: string; roleId: string; jobTitle: string | null; isActive: boolean }; roles: Option[]; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const defaults = { id: user.id, name: user.name, roleId: user.roleId, jobTitle: user.jobTitle ?? "", isActive: user.isActive };
  const { form, submit, formError } = useSchemaForm(r(userUpdateSchema), defaults, updateUserAction, "User updated", () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild><Button size="xs" variant="outline">Edit</Button></DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Edit {user.name}</DialogTitle>
              <DialogDescription>Changing the role or deactivating signs the user out immediately.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Full name" required />
              <TextField name="jobTitle" label="Job title" />
              <SelectField name="roleId" label="Role" required options={roles} disabled={isSelf} />
              <CheckboxField name="isActive" label="Active" description={isSelf ? "You cannot deactivate yourself." : "Inactive users cannot sign in."} disabled={isSelf} />
            </div>
            <DialogFooter><SubmitButton pending={form.formState.isSubmitting}>Save</SubmitButton></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

// ─── Roles & permissions ───────────────────────────────────────────────────

export function CreateRoleDialog() {
  const [open, setOpen] = useState(false);
  const defaults = { name: "", description: "", dataScope: "OWN" as const };
  const { form, submit, formError } = useSchemaForm(r(roleCreateSchema), defaults, createRoleAction, "Role created", () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> New role</Button></DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>New role</DialogTitle>
              <DialogDescription>New roles start with no permissions; grant them in the matrix.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <TextField name="name" label="Role name" required />
            <TextField name="description" label="Description" />
            <SelectField name="dataScope" label="Record visibility" required options={[{ value: "ALL", label: "All records in the organization" }, { value: "OWN", label: "Only records they own or are assigned" }]} />
            <DialogFooter><SubmitButton pending={form.formState.isSubmitting}>Create role</SubmitButton></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function RolePermissionsEditor({ role }: { role: { id: string; key: string; name: string; description: string | null; dataScope: "ALL" | "OWN"; permissions: string[]; users: number } }) {
  const router = useRouter();
  const locked = role.key === "ADMIN";
  const [perms, setPerms] = useState(new Set(role.permissions));
  const [scope, setScope] = useState(role.dataScope);
  const [pending, start] = useTransition();
  const dirty = scope !== role.dataScope || perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));
  const toggle = (k: string) => setPerms((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const save = () =>
    start(async () => {
      const res = await updateRolePermissionsAction({ roleId: role.id, dataScope: scope, permissions: [...perms] });
      if (res.ok) { toast.success("Permissions saved"); router.refresh(); } else toast.error(res.error);
    });

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">{role.name} {locked && <StatusBadge tone="info">Locked</StatusBadge>}</h2>
          <p className="text-sm text-muted-foreground">{role.description} · {role.users} user(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor={`scope-${role.id}`}>Record visibility</label>
          <select id={`scope-${role.id}`} disabled={locked} value={scope} onChange={(e) => setScope(e.target.value as "ALL" | "OWN")} className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="ALL">All records</option>
            <option value="OWN">Own / assigned only</option>
          </select>
          {!locked && <Button size="sm" onClick={save} disabled={!dirty || pending}>{pending && <Loader2 className="size-4 animate-spin" />}Save</Button>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PERMISSION_MODULES.map((m) => {
          const keys = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((k) => k.startsWith(`${m.key}.`));
          return (
            <fieldset key={m.key} className="rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">{m.label}</legend>
              <div className="space-y-1.5">
                {keys.map((k) => (
                  <label key={k} className={cn("flex items-start gap-2 text-sm", locked && "opacity-70")}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={locked || perms.has(k)} disabled={locked} onChange={() => toggle(k)} />
                    <span>{PERMISSIONS[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

// ─── Configuration lists ────────────────────────────────────────────────────

export function AddLeadSourceForm() {
  const { form, submit } = useSchemaForm(r(leadSourceSchema), { name: "" }, addLeadSourceAction, "Lead source added", (f) => f.reset({ name: "" }));
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex items-end gap-2" noValidate>
        <TextField name="name" label="New lead source" className="flex-1" />
        <SubmitButton pending={form.formState.isSubmitting}>Add</SubmitButton>
      </form>
    </FormProvider>
  );
}

export function AddCategoryForm() {
  const { form, submit } = useSchemaForm(r(categorySchema), { name: "", description: "" }, addCategoryAction, "Category added", (f) => f.reset({ name: "", description: "" }));
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex items-end gap-2" noValidate>
        <TextField name="name" label="New category" className="flex-1" />
        <SubmitButton pending={form.formState.isSubmitting}>Add</SubmitButton>
      </form>
    </FormProvider>
  );
}

export function AddTaxRateForm() {
  const { form, submit } = useSchemaForm(r(taxRateSchema), { name: "", ratePercent: "" }, addTaxRateAction, "Tax rate added", (f) => f.reset({ name: "", ratePercent: "" }));
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid grid-cols-[1fr_100px_auto] items-end gap-2" noValidate>
        <TextField name="name" label="Tax name" />
        <TextField name="ratePercent" label="Rate %" inputMode="decimal" />
        <SubmitButton pending={form.formState.isSubmitting}>Add</SubmitButton>
      </form>
    </FormProvider>
  );
}

export function ToggleActive({ id, isActive, kind }: { id: string; isActive: boolean; kind: "source" | "tax" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = kind === "source" ? await toggleLeadSourceAction(id, !isActive) : await toggleTaxRateAction(id, !isActive);
          if (res.ok) { toast.success(res.message ?? "Saved"); router.refresh(); } else toast.error(res.error);
        })
      }
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}

// ─── Organization & workflow ───────────────────────────────────────────────

export function OrganizationForm({ defaults }: { defaults: z.input<typeof organizationSchema> }) {
  const { form, submit, formError } = useSchemaForm(r(organizationSchema), defaults, updateOrganizationAction, "Organization updated");
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-3" noValidate>
        <FormErrorBanner message={formError} />
        <TextField name="name" label="Organization name" required />
        <SelectField name="baseCurrency" label="Base (reporting) currency" required options={COMMON_CURRENCIES.map((c) => ({ value: c, label: c }))} description="Dashboards sum orders in this currency only." />
        <TextField name="timezone" label="Timezone (IANA)" required description="e.g. Asia/Kolkata, America/New_York" />
        <div className="sm:col-span-3"><SubmitButton pending={form.formState.isSubmitting}>Save organization</SubmitButton></div>
      </form>
    </FormProvider>
  );
}

type WorkflowValues = {
  allowSkipStages: boolean;
  allowBackward: boolean;
  allowReopenConverted: boolean;
  discountsEnabled: boolean;
  maxDiscountPercent: number;
  taxEnabled: boolean;
  requireResolutionNote: boolean;
  orderTransitions: Record<string, string[]>;
};

export function WorkflowForm({ defaults }: { defaults: WorkflowValues }) {
  const router = useRouter();
  const [v, setV] = useState(defaults);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WorkflowValues>(k: K, val: WorkflowValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const toggleTransition = (from: string, to: string) =>
    setV((s) => {
      const cur = s.orderTransitions[from] ?? [];
      return { ...s, orderTransitions: { ...s.orderTransitions, [from]: cur.includes(to) ? cur.filter((x) => x !== to) : [...cur, to] } };
    });
  const save = () =>
    start(async () => {
      setError(null);
      const res = await updateWorkflowAction(v);
      if (res.ok) { toast.success("Workflow settings saved"); router.refresh(); } else { setError(res.fieldErrors ? Object.values(res.fieldErrors)[0]! : res.error); toast.error(res.error); }
    });
  const check = (k: keyof WorkflowValues, label: string, desc: string) => (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={Boolean(v[k])} onChange={(e) => set(k, e.target.checked as never)} />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </label>
  );
  return (
    <div className="space-y-6">
      <FormErrorBanner message={error} />
      <section className="space-y-3">
        <h3 className="font-semibold">Lead lifecycle</h3>
        {check("allowSkipStages", "Allow skipping stages", "Leads may jump forward more than one stage, and be converted before reaching “Lead Mature”.")}
        {check("allowBackward", "Allow moving back", "Open leads may return to an earlier stage.")}
        {check("allowReopenConverted", "Allow reopening converted leads", "A converted lead can be moved back to an open stage; the conversion stamp is cleared but history is kept.")}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Pricing</h3>
        {check("discountsEnabled", "Enable line discounts", "Allows a percentage discount per order line.")}
        <label className="flex items-center gap-2 text-sm">
          Maximum discount %
          <input type="number" min={0} max={100} className="h-8 w-20 rounded-md border bg-background px-2" value={v.maxDiscountPercent} onChange={(e) => set("maxDiscountPercent", Number(e.target.value))} />
        </label>
        {check("taxEnabled", "Apply tax", "Order lines use each product's tax classification.")}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Support tickets</h3>
        {check("requireResolutionNote", "Require a resolution note", "Agents must describe the fix before resolving a ticket.")}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Order status workflow</h3>
        <p className="text-xs text-muted-foreground">Tick the statuses an order may move to from each status. Delivered and Cancelled are final.</p>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">From ↓ / To →</th>
                {ORDER_STATUSES.filter((s) => s !== "DRAFT").map((s) => <th key={s} className="p-2 font-medium">{ORDER_STATUS_META[s].label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ORDER_STATUSES.filter((s) => s !== "DELIVERED" && s !== "CANCELLED").map((from) => (
                <tr key={from} className="border-t">
                  <td className="p-2 font-medium">{ORDER_STATUS_META[from].label}</td>
                  {ORDER_STATUSES.filter((s) => s !== "DRAFT").map((to) => (
                    <td key={to} className="p-2 text-center">
                      {from === to ? "—" : (
                        <input type="checkbox" aria-label={`${from} to ${to}`} className="size-4 accent-[var(--primary)]" checked={(v.orderTransitions[from] ?? []).includes(to)} onChange={() => toggleTransition(from, to)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Save workflow settings</Button>
    </div>
  );
}
