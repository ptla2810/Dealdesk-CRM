"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft, Loader2, MessageSquarePlus, Sparkles, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComboboxField, MultiComboboxField, SelectField, TextField, TextareaField, CheckboxField, type Option } from "@/components/forms/fields";
import { FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { DuplicateDialog } from "@/components/forms/duplicate-dialog";
import { discussionSchema, leadAssignSchema, leadConvertSchema, leadStageChangeSchema, type DiscussionInput, type LeadConvertInput, type LeadStageChangeInput } from "@/lib/validation/lead";
import { LEAD_STAGE_META, INDUSTRIES } from "@/lib/constants";
import type { LeadStage } from "@prisma/client";
import { addDiscussionAction, assignLeadAction, changeLeadStageAction, convertLeadAction } from "@/app/(app)/leads/actions";
import type { z } from "zod";

function useDialog() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

export function StageChangeDialog({ leadId, version, current, targets }: { leadId: string; version: number; current: LeadStage; targets: LeadStage[] }) {
  const { open, setOpen } = useDialog();
  const form = useForm<LeadStageChangeInput>({ resolver: zodResolver(leadStageChangeSchema), defaultValues: { id: leadId, version, toStage: targets[0], note: "" } });
  const { submit, formError } = useServerForm(form, changeLeadStageAction, { successMessage: "Stage updated", onSuccess: () => void setOpen(false) });
  if (!targets.length) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset({ id: leadId, version, toStage: targets[0], note: "" }); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="size-4" /> Change stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Change lead stage</DialogTitle>
              <DialogDescription>Currently “{LEAD_STAGE_META[current].label}”. Only transitions allowed by your workflow settings are listed.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <SelectField<LeadStageChangeInput> name="toStage" label="New stage" required options={targets.map((s) => ({ value: s, label: LEAD_STAGE_META[s].label }))} />
            <TextareaField<LeadStageChangeInput> name="note" label="Note" rows={2} placeholder="Why is the stage changing?" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Update stage
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function DiscussionDialog({
  leadId,
  meetingId,
  users,
  defaultResponsible,
  today,
  trigger,
}: {
  leadId: string;
  meetingId?: string;
  users: Option[];
  defaultResponsible: string;
  today: string;
  trigger?: React.ReactNode;
}) {
  const { open, setOpen } = useDialog();
  const defaults: DiscussionInput = { leadId, meetingId: meetingId ?? "", discussedAt: today, summary: "", requirements: "", objections: "", nextSteps: "", nextFollowUpAt: "", responsibleUserId: defaultResponsible };
  const form = useForm<DiscussionInput>({ resolver: zodResolver(discussionSchema), defaultValues: defaults });
  const { submit, formError } = useServerForm(form, addDiscussionAction, { successMessage: "Discussion update added", onSuccess: () => void setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <MessageSquarePlus className="size-4" /> Add discussion update
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Discussion update</DialogTitle>
              <DialogDescription>Record what was discussed and the next commitment. The follow-up date becomes the lead&apos;s next follow-up.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField<DiscussionInput> name="discussedAt" label="Discussion date" type="date" required />
              <SelectField<DiscussionInput> name="responsibleUserId" label="Responsible salesperson" required options={users} />
              <TextareaField<DiscussionInput> name="summary" label="Summary" required rows={3} className="sm:col-span-2" />
              <TextareaField<DiscussionInput> name="requirements" label="Customer requirements" rows={2} />
              <TextareaField<DiscussionInput> name="objections" label="Customer objections" rows={2} />
              <TextareaField<DiscussionInput> name="nextSteps" label="Next steps" rows={2} />
              <TextField<DiscussionInput> name="nextFollowUpAt" label="Next follow-up date" type="date" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Save update
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function AssignDialog({ leadId, version, ownerId, users }: { leadId: string; version: number; ownerId: string; users: Option[] }) {
  const { open, setOpen } = useDialog();
  type V = z.input<typeof leadAssignSchema>;
  const form = useForm<V>({ resolver: zodResolver(leadAssignSchema), defaultValues: { id: leadId, version, ownerId } });
  const { submit, formError } = useServerForm(form, assignLeadAction, { successMessage: "Lead reassigned", onSuccess: () => void setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset({ id: leadId, version, ownerId }); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserCog className="size-4" /> Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Assign lead</DialogTitle>
              <DialogDescription>The new owner is notified in-app.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <SelectField<V> name="ownerId" label="Lead owner" required options={users} />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Assign
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function ConvertDialog({
  lead,
  accounts,
  contacts,
  owners,
  canCreateAccount,
}: {
  lead: { id: string; version: number; companyName: string; email: string; phone: string; ownerId: string; accountId: string | null };
  accounts: Option[];
  contacts: (Option & { accountId: string | null })[];
  owners: Option[];
  canCreateAccount: boolean;
}) {
  const router = useRouter();
  const { open, setOpen } = useDialog();
  const defaults: LeadConvertInput = {
    id: lead.id,
    version: lead.version,
    accountMode: lead.accountId || !canCreateAccount ? "existing" : "new",
    accountId: lead.accountId ?? "",
    newAccount: { name: lead.companyName, email: lead.email, phone: lead.phone, ownerId: lead.ownerId, status: "ACTIVE", country: "", industry: "", website: "", city: "" },
    contactIds: [],
    createContactFromLead: true,
    acknowledgeDuplicates: false,
    note: "",
  };
  const form = useForm<LeadConvertInput>({ resolver: zodResolver(leadConvertSchema), defaultValues: defaults });
  const { submit, formError, duplicates, setDuplicates } = useServerForm(form, convertLeadAction, {
    successMessage: "Lead converted",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const mode = useWatch({ control: form.control, name: "accountMode" });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const contactOptions = contacts.filter((c) => (mode === "existing" ? !c.accountId || c.accountId === accountId : !c.accountId));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
        <DialogTrigger asChild>
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Sparkles className="size-4" /> Convert lead
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>Convert lead</DialogTitle>
                <DialogDescription>Links the lead to a customer account and its buyer contacts. History is preserved, and a lead can only be converted once.</DialogDescription>
              </DialogHeader>
              <FormErrorBanner message={formError} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Account</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" value="existing" className="accent-[var(--primary)]" {...form.register("accountMode")} /> Link an existing account
                  </label>
                  <label className={`flex items-center gap-2 ${canCreateAccount ? "" : "opacity-50"}`}>
                    <input type="radio" value="new" disabled={!canCreateAccount} className="accent-[var(--primary)]" {...form.register("accountMode")} /> Create a new account
                  </label>
                </div>
              </fieldset>
              {mode === "existing" ? (
                <ComboboxField<LeadConvertInput> name="accountId" label="Account" required options={accounts} allowClear={false} />
              ) : (
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <TextField<LeadConvertInput> name="newAccount.name" label="Company name" required />
                  <TextField<LeadConvertInput> name="newAccount.email" label="Business email" type="email" required />
                  <TextField<LeadConvertInput> name="newAccount.phone" label="Business phone" required />
                  <TextField<LeadConvertInput> name="newAccount.country" label="Country (ISO code)" placeholder="US" />
                  <SelectField<LeadConvertInput> name="newAccount.industry" label="Industry" options={INDUSTRIES.map((i) => ({ value: i, label: i }))} placeholder="—" />
                  <SelectField<LeadConvertInput> name="newAccount.ownerId" label="Account owner" options={owners} />
                </div>
              )}
              <MultiComboboxField<LeadConvertInput> name="contactIds" label="Buyer contacts" options={contactOptions} placeholder="Select existing contacts (optional)" />
              <CheckboxField<LeadConvertInput> name="createContactFromLead" label="Create a buyer contact from the lead's name, email and phone" description="Skipped automatically if a contact with this email already exists — it is linked instead." />
              <TextareaField<LeadConvertInput> name="note" label="Conversion note" rows={2} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  Convert
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
      <DuplicateDialog
        state={duplicates}
        pending={form.formState.isSubmitting}
        onClose={() => setDuplicates(null)}
        onProceed={() => {
          form.setValue("acknowledgeDuplicates", true);
          form.handleSubmit(submit)();
        }}
      />
    </>
  );
}
