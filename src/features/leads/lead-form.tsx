"use client";

import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadCreateSchema, leadUpdateSchema, type LeadCreateInput, type LeadUpdateInput } from "@/lib/validation/lead";
import { ComboboxField, FormSection, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { LEAD_STAGE_META } from "@/lib/constants";
import { createLeadAction, updateLeadAction } from "@/app/(app)/leads/actions";

type Props = {
  mode: "create" | "edit";
  defaults: Partial<LeadUpdateInput & LeadCreateInput>;
  sources: Option[];
  owners: Option[];
  accounts: Option[];
  canAssign: boolean;
  currency: string;
  cancelHref: string;
};

export function LeadForm({ mode, defaults, sources, owners, accounts, canAssign, currency, cancelHref }: Props) {
  type Values = LeadCreateInput & Partial<Pick<LeadUpdateInput, "id" | "version">>;
  const schema = mode === "create" ? leadCreateSchema : leadUpdateSchema;
  const form = useForm<Values>({
    // One form serves both schemas; the server re-validates with the matching schema.
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      companyName: "",
      accountId: "",
      sourceId: "",
      ownerId: "",
      estimatedValue: "",
      description: "",
      nextFollowUpAt: "",
      stage: "QUALIFIED",
      ...defaults,
    },
  });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createLeadAction(v) : updateLeadAction(v)), {
    successMessage: mode === "create" ? "Lead created" : "Lead updated",
    onSuccess: (d: { id: string }) => `/leads/${d.id}`,
  });

  const onAccountSelected = (id: string) => {
    const acc = accounts.find((a) => a.value === id);
    if (acc && !form.getValues("companyName")) form.setValue("companyName", acc.label.replace(/^ACC-\d+ · /, ""));
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Lead details" description="Who is the buyer and how did they reach us?">
          <TextField name="name" label="Lead name" required autoComplete="off" />
          <TextField name="companyName" label="Company name" required />
          <TextField name="email" label="Email" type="email" required autoComplete="off" />
          <TextField name="phone" label="Phone number" type="tel" required placeholder="+1 415 555 0123" description="Include the country code." />
          <ComboboxField
            name="accountId"
            label="Existing account"
            options={accounts}
            placeholder="Not linked yet"
            description="Link when the company already exists as an account."
            onSelected={onAccountSelected}
          />
          <SelectField name="sourceId" label="Lead source" required options={sources} placeholder="Select a source" />
        </FormSection>
        <FormSection title="Qualification" description="Ownership, stage and value of the opportunity.">
          <SelectField
            name="ownerId"
            label="Lead owner"
            required
            options={owners}
            disabled={!canAssign}
            description={canAssign ? undefined : "Only users who can assign leads may change the owner."}
          />
          {mode === "create" ? (
            <SelectField
              name="stage"
              label="Lead stage"
              required
              options={(["QUALIFIED", "IN_DISCUSSION", "MATURE"] as const).map((s) => ({ value: s, label: LEAD_STAGE_META[s].label }))}
              description="Conversion happens from the lead page."
            />
          ) : (
            <div />
          )}
          <TextField name="estimatedValue" label={`Estimated deal value (${currency})`} required inputMode="decimal" placeholder="25000" />
          <TextField name="nextFollowUpAt" label="Next follow-up date" type="date" required />
          <TextareaField name="description" label="Description and sales insights" required rows={4} className="sm:col-span-2" />
        </FormSection>
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create lead" : "Save changes"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
