"use client";

import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckboxField, TextareaField, type Option } from "@/components/forms/fields";
import { FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { minuteCreateSchema, type MinuteCreateInput } from "@/lib/validation/meeting";
import { addMinutesAction } from "@/app/(app)/meetings/actions";
import { ActionItemsEditor } from "./action-items-editor";

export function MinutesDialog({ meetingId, users, defaultOwner, isCompleted }: { meetingId: string; users: Option[]; defaultOwner: string; isCompleted: boolean }) {
  const [open, setOpen] = useState(false);
  const defaults: MinuteCreateInput = { meetingId, summary: "", requirements: "", decisions: "", notes: "", actionItems: [], markCompleted: !isCompleted };
  const form = useForm<MinuteCreateInput>({ resolver: zodResolver(minuteCreateSchema), defaultValues: defaults });
  const { submit, formError } = useServerForm(form, addMinutesAction, { successMessage: "Minutes recorded", onSuccess: () => void setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FileText className="size-4" /> Add MOM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Minutes of meeting</DialogTitle>
              <DialogDescription>Record what was discussed and decided. Owners of new action items are notified.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextareaField<MinuteCreateInput> name="summary" label="Discussion summary" required rows={3} className="sm:col-span-2" />
              <TextareaField<MinuteCreateInput> name="requirements" label="Customer requirements" rows={2} />
              <TextareaField<MinuteCreateInput> name="decisions" label="Decisions taken" rows={2} />
              <TextareaField<MinuteCreateInput> name="notes" label="Additional notes" rows={2} className="sm:col-span-2" />
              <ActionItemsEditor name="actionItems" users={users} defaultOwner={defaultOwner} />
              {!isCompleted && <CheckboxField<MinuteCreateInput> name="markCompleted" label="Mark the meeting as completed" className="sm:col-span-2" />}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Save minutes
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
