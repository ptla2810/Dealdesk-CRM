"use client";

import { FormProvider, useForm, type Resolver, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactCreateSchema, contactUpdateSchema, type ContactCreateInput } from "@/lib/validation/contact";
import { CheckboxField, ComboboxField, FormSection, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { CHANNELS, CHANNEL_LABEL, CONTACT_STATUSES, CONTACT_STATUS_META, SUBSCRIPTION_META, SUBSCRIPTION_STATUSES } from "@/lib/constants";
import { createContactAction, updateContactAction } from "@/app/(app)/contacts/actions";

type Values = ContactCreateInput & { id?: string };

export function ContactForm({ mode, defaults, owners, accounts, canChooseOwner, cancelHref }: { mode: "create" | "edit"; defaults: Partial<Values>; owners: Option[]; accounts: Option[]; canChooseOwner: boolean; cancelHref: string }) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? contactCreateSchema : contactUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      designation: "",
      department: "",
      accountId: "",
      ownerId: "",
      preferredChannel: "EMAIL",
      status: "ACTIVE",
      source: "",
      notes: "",
      marketingConsent: false,
      consentSource: "",
      subscriptionStatus: "NOT_SUBSCRIBED",
      ...defaults,
    },
  });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createContactAction(v) : updateContactAction(v)), {
    successMessage: mode === "create" ? "Contact created" : "Contact updated",
    onSuccess: (d: { id: string }) => `/contacts/${d.id}`,
  });
  const consent = useWatch({ control: form.control, name: "marketingConsent" });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Contact">
          <TextField name="firstName" label="First name" required />
          <TextField name="lastName" label="Last name" required />
          <TextField name="email" label="Email" type="email" required />
          <TextField name="phone" label="Phone number" type="tel" placeholder="+1 415 555 0123" />
          <TextField name="designation" label="Designation" />
          <TextField name="department" label="Department" />
          <ComboboxField name="accountId" label="Associated account" options={accounts} placeholder="No account" />
          <SelectField name="ownerId" label="Contact owner" required options={owners} disabled={!canChooseOwner} />
          <SelectField name="preferredChannel" label="Preferred communication channel" required options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
          <SelectField name="status" label="Contact status" required options={CONTACT_STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_META[s].label }))} />
          <TextField name="source" label="Source" placeholder="Trade show, referral…" />
          <TextareaField name="notes" label="Notes" rows={3} className="sm:col-span-2" />
        </FormSection>
        <FormSection title="Marketing consent" description="Recorded for future email-campaign integrations. LeadZen does not send marketing email itself.">
          <CheckboxField name="marketingConsent" label="Contact has given marketing consent" description="The consent timestamp is recorded automatically when consent is first given." className="sm:col-span-2" />
          {consent && <TextField name="consentSource" label="Consent source" placeholder="Web form, signed agreement…" />}
          <SelectField
            name="subscriptionStatus"
            label="Email subscription status"
            required
            options={SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: SUBSCRIPTION_META[s].label }))}
            description="Withdrawing consent automatically unsubscribes the contact."
          />
        </FormSection>
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create contact" : "Save changes"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
