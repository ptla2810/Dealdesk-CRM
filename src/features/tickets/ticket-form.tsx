"use client";

import { FormProvider, useForm, type Resolver, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ticketCreateSchema, ticketUpdateSchema, type TicketCreateInput } from "@/lib/validation/ticket";
import { ComboboxField, FormSection, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_META } from "@/lib/constants";
import { createTicketAction, updateTicketAction } from "@/app/(app)/tickets/actions";

type Values = TicketCreateInput & { id?: string; version?: number };
type Linked = Option & { accountId: string | null };

export function TicketForm({
  mode,
  defaults,
  accounts,
  contacts,
  leads,
  orders,
  agents,
  canAssign,
  cancelHref,
}: {
  mode: "create" | "edit";
  defaults: Partial<Values>;
  accounts: Option[];
  contacts: Linked[];
  leads: Linked[];
  orders: Linked[];
  agents: Option[];
  canAssign: boolean;
  cancelHref: string;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? ticketCreateSchema : ticketUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: { subject: "", description: "", accountId: "", contactId: "", leadId: "", orderId: "", category: "GENERAL_INQUIRY", priority: "MEDIUM", assignedToId: "", internalNote: "", ...defaults },
  });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createTicketAction(v) : updateTicketAction(v)), {
    successMessage: mode === "create" ? "Ticket created" : "Ticket updated",
    onSuccess: (d: { id: string }) => `/tickets/${d.id}`,
  });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  // Records must belong to the selected account; contacts/leads not yet linked to any account are also allowed.
  const forAccount = (list: Linked[], allowUnlinked: boolean) => (accountId ? list.filter((x) => x.accountId === accountId || (allowUnlinked && !x.accountId)) : []);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Ticket">
          <TextField name="subject" label="Subject" required className="sm:col-span-2" />
          <TextareaField name="description" label="Description" required rows={5} className="sm:col-span-2" />
          <SelectField name="category" label="Category" required options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABEL[c] }))} />
          {mode === "create" && <SelectField name="priority" label="Priority" required options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_META[p].label }))} />}
        </FormSection>
        <FormSection title="Customer & context">
          <ComboboxField
            name="accountId"
            label="Account"
            required
            options={accounts}
            allowClear={false}
            onSelected={() => {
              form.setValue("contactId", "");
              form.setValue("orderId", "");
              form.setValue("leadId", "");
            }}
          />
          <ComboboxField name="contactId" label="Contact" options={forAccount(contacts, true)} placeholder={accountId ? "Select contact" : "Select an account first"} />
          <ComboboxField name="orderId" label="Related order" options={forAccount(orders, false)} placeholder={accountId ? "Select order" : "Select an account first"} />
          <ComboboxField name="leadId" label="Related lead" options={forAccount(leads, true)} placeholder={accountId ? "Select lead" : "Select an account first"} />
        </FormSection>
        {mode === "create" && (
          <FormSection title="Handling">
            {canAssign ? <SelectField name="assignedToId" label="Assigned agent" options={agents} placeholder="Unassigned" /> : <p className="text-sm text-muted-foreground">A support lead will assign this ticket.</p>}
            <TextareaField name="internalNote" label="Internal note" rows={3} description="Visible to your team only — never to the customer." className="sm:col-span-2" />
            <p className="text-xs text-muted-foreground sm:col-span-2">File attachments are not supported yet (no file storage is configured).</p>
          </FormSection>
        )}
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create ticket" : "Save changes"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
