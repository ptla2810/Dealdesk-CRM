"use client";

import { FormProvider, useForm, type Resolver, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { meetingCreateSchema, meetingUpdateSchema, type MeetingCreateInput } from "@/lib/validation/meeting";
import { ComboboxField, FormSection, MultiComboboxField, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { MEETING_STATUSES, MEETING_STATUS_META, MEETING_TYPES, MEETING_TYPE_LABEL } from "@/lib/constants";
import { createMeetingAction, updateMeetingAction } from "@/app/(app)/meetings/actions";
import { ActionItemsEditor } from "./action-items-editor";

type Values = MeetingCreateInput & { id?: string };

export function MeetingForm({
  mode,
  defaults,
  users,
  accounts,
  leads,
  contacts,
  canAssign,
  cancelHref,
  timeZone,
}: {
  mode: "create" | "edit";
  defaults: Partial<Values>;
  users: Option[];
  accounts: Option[];
  leads: (Option & { accountId: string | null })[];
  contacts: (Option & { accountId: string | null })[];
  canAssign: boolean;
  cancelHref: string;
  timeZone: string;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? meetingCreateSchema : meetingUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: {
      title: "",
      scheduledAt: "",
      durationMins: "60",
      type: "VIDEO_CALL",
      status: "SCHEDULED",
      location: "",
      agenda: "",
      accountId: "",
      leadId: "",
      contactIds: [],
      assignedToId: "",
      nextFollowUpAt: "",
      ...(mode === "create" ? { minutes: { summary: "", requirements: "", decisions: "", notes: "", actionItems: [] } } : {}),
      ...defaults,
    },
  });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createMeetingAction(v) : updateMeetingAction(v)), {
    successMessage: mode === "create" ? "Meeting saved" : "Meeting updated",
    onSuccess: (d: { id: string }) => `/meetings/${d.id}`,
  });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const leadOptions = accountId ? leads.filter((l) => !l.accountId || l.accountId === accountId) : leads;
  const contactOptions = accountId ? contacts.filter((c) => c.accountId === accountId) : contacts;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Meeting" description={`Times are in the organization timezone (${timeZone}).`}>
          <TextField name="title" label="Meeting title" required className="sm:col-span-2" />
          <TextField name="scheduledAt" label="Date and time" type="datetime-local" required />
          <TextField name="durationMins" label="Duration (minutes)" inputMode="numeric" required />
          <SelectField name="type" label="Meeting type" required options={MEETING_TYPES.map((t) => ({ value: t, label: MEETING_TYPE_LABEL[t] }))} />
          <SelectField name="status" label="Meeting status" required options={MEETING_STATUSES.map((s) => ({ value: s, label: MEETING_STATUS_META[s].label }))} />
          <TextField name="location" label="Location / link" />
          <SelectField name="assignedToId" label="Assigned salesperson" required options={users} disabled={!canAssign} />
          <TextareaField name="agenda" label="Meeting notes / agenda" rows={3} className="sm:col-span-2" />
        </FormSection>
        <FormSection title="Customer" description="Link the meeting to an account, a lead, or both.">
          <ComboboxField
            name="accountId"
            label="Account"
            options={accounts}
            placeholder="Select account"
            onSelected={() => {
              form.setValue("contactIds", []);
            }}
          />
          <ComboboxField
            name="leadId"
            label="Related lead"
            options={leadOptions}
            placeholder="Select lead"
            onSelected={(id) => {
              const lead = leads.find((l) => l.value === id);
              if (lead?.accountId && !form.getValues("accountId")) form.setValue("accountId", lead.accountId);
            }}
          />
          <MultiComboboxField name="contactIds" label="Customer contacts" options={contactOptions} placeholder={accountId ? "Select contacts" : "Select an account first to narrow contacts"} className="sm:col-span-2" />
          <TextField name="nextFollowUpAt" label="Next follow-up date" type="date" />
        </FormSection>
        {mode === "create" && (
          <FormSection title="Minutes of meeting (optional)" description="Fill this in when logging a meeting that already happened. You can also add minutes later from the meeting page.">
            <TextareaField name="minutes.summary" label="Discussion summary" rows={3} className="sm:col-span-2" />
            <TextareaField name="minutes.requirements" label="Customer requirements" rows={2} />
            <TextareaField name="minutes.decisions" label="Decisions taken" rows={2} />
            <ActionItemsEditor name="minutes.actionItems" users={users} defaultOwner={(defaults.assignedToId as string) ?? ""} />
          </FormSection>
        )}
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Save meeting" : "Save changes"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
