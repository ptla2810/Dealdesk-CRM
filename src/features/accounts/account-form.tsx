"use client";

import Link from "next/link";
import { useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { accountCreateSchema, accountUpdateSchema, type AccountCreateInput } from "@/lib/validation/account";
import { FormSection, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm, type DuplicateMatch } from "@/components/forms/use-server-form";
import { DuplicateDialog } from "@/components/forms/duplicate-dialog";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META, INDUSTRIES } from "@/lib/constants";
import { checkAccountDuplicatesAction, createAccountAction, updateAccountAction } from "@/app/(app)/accounts/actions";

type Values = AccountCreateInput & { id?: string };

export function AccountForm({ mode, defaults, owners, canAssign, cancelHref }: { mode: "create" | "edit"; defaults: Partial<Values>; owners: Option[]; canAssign: boolean; cancelHref: string }) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? accountCreateSchema : accountUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      website: "",
      industry: "",
      addressLine: "",
      country: "",
      state: "",
      city: "",
      postalCode: "",
      ownerId: "",
      description: "",
      status: "PROSPECT",
      acknowledgeDuplicates: false,
      ...defaults,
    },
  });
  const { submit, formError, duplicates, setDuplicates } = useServerForm(form, (v) => (mode === "create" ? createAccountAction(v) : updateAccountAction(v)), {
    successMessage: mode === "create" ? "Account created" : "Account updated",
    onSuccess: (d: { id: string }) => `/accounts/${d.id}`,
  });
  // Live duplicate hints while typing (the server re-checks on submit).
  const [hints, setHints] = useState<DuplicateMatch[]>([]);
  const checkDuplicates = async () => {
    const { name, email, phone, country } = form.getValues();
    if (!name?.trim()) return setHints([]);
    const res = await checkAccountDuplicatesAction({ name, email, phone, country }, defaults.id);
    if (res.ok) setHints(res.data);
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} onBlur={(e) => ["name", "email", "phone"].includes((e.target as unknown as HTMLInputElement).name) && checkDuplicates()} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        {hints.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" /> Possible duplicates
            </div>
            <ul className="mt-1 list-disc pl-6">
              {hints.map((h) => (
                <li key={h.id}>
                  <Link href={h.href} target="_blank" className="underline">
                    {h.label}
                  </Link>{" "}
                  — {h.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <FormSection title="Company">
          <TextField name="name" label="Company name" required />
          <SelectField name="industry" label="Industry" options={INDUSTRIES.map((i) => ({ value: i, label: i }))} placeholder="—" />
          <TextField name="email" label="Business email" type="email" required />
          <TextField name="phone" label="Business phone" type="tel" required description="International format, or set the country below." />
          <TextField name="website" label="Website" placeholder="example.com" />
          <SelectField name="status" label="Account status" required options={ACCOUNT_STATUSES.map((s) => ({ value: s, label: ACCOUNT_STATUS_META[s].label }))} />
        </FormSection>
        <FormSection title="Address">
          <TextField name="addressLine" label="Company address" className="sm:col-span-2" />
          <TextField name="city" label="City" />
          <TextField name="state" label="State / region" />
          <TextField name="postalCode" label="Postal code" />
          <TextField name="country" label="Country" placeholder="US" description="2-letter ISO code (US, GB, IN, DE …)" />
        </FormSection>
        <FormSection title="Ownership">
          <SelectField name="ownerId" label="Account owner" required options={owners} disabled={!canAssign} description={canAssign ? undefined : "You will own accounts you create."} />
          <TextareaField name="description" label="Description" rows={3} className="sm:col-span-2" />
        </FormSection>
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create account" : "Save changes"} cancelHref={cancelHref} />
      </form>
      <DuplicateDialog
        state={duplicates}
        pending={form.formState.isSubmitting}
        onClose={() => setDuplicates(null)}
        onProceed={() => {
          form.setValue("acknowledgeDuplicates", true);
          form.handleSubmit(submit)();
        }}
      />
    </FormProvider>
  );
}
