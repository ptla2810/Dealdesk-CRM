"use client";

import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MapPin } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { deliveryEventSchema, orderStatusChangeSchema, type DeliveryEventInput, type OrderStatusChangeInput } from "@/lib/validation/order";
import { DELIVERY_STATUS_META, ORDER_STATUS_META } from "@/lib/constants";
import { addDeliveryEventAction, changeOrderStatusAction } from "@/app/(app)/orders/actions";

const BUTTON_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirm order",
  PROCESSING: "Start processing",
  SHIPPED: "Mark shipped",
  DELIVERED: "Mark delivered",
  CANCELLED: "Cancel order",
};

export function OrderStatusButton({ orderId, version, to, carrier, trackingNumber, today }: { orderId: string; version: number; to: OrderStatus; carrier: string | null; trackingNumber: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  const defaults: OrderStatusChangeInput = { id: orderId, version, toStatus: to, note: "", carrier: carrier ?? "", trackingNumber: trackingNumber ?? "", actualDeliveryDate: to === "DELIVERED" ? today : "" };
  const form = useForm<OrderStatusChangeInput>({ resolver: zodResolver(orderStatusChangeSchema), defaultValues: defaults });
  const { submit, formError } = useServerForm(form, changeOrderStatusAction, { successMessage: `Order ${ORDER_STATUS_META[to].label.toLowerCase()}`, onSuccess: () => void setOpen(false) });
  const cancel = to === "CANCELLED";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={cancel ? "outline" : "default"} className={cancel ? "text-destructive" : undefined}>
          {BUTTON_LABEL[to] ?? ORDER_STATUS_META[to].label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{BUTTON_LABEL[to]}</DialogTitle>
              <DialogDescription>
                {cancel ? "Cancelling is final. The order is excluded from sales volume." : `The order moves to “${ORDER_STATUS_META[to].label}”. This is recorded in the status history.`}
                {to === "CONFIRMED" && " Confirmed orders can no longer be edited."}
              </DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            {to === "SHIPPED" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField<OrderStatusChangeInput> name="carrier" label="Carrier" />
                <TextField<OrderStatusChangeInput> name="trackingNumber" label="Tracking number" />
              </div>
            )}
            {to === "DELIVERED" && <TextField<OrderStatusChangeInput> name="actualDeliveryDate" label="Actual delivery date" type="date" />}
            <TextareaField<OrderStatusChangeInput> name="note" label={cancel ? "Reason for cancellation" : "Note"} rows={2} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Back</Button>
              <Button type="submit" variant={cancel ? "destructive" : "default"} disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {BUTTON_LABEL[to]}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function DeliveryEventDialog({ orderId, version, carrier, trackingNumber, now }: { orderId: string; version: number; carrier: string | null; trackingNumber: string | null; now: string }) {
  const [open, setOpen] = useState(false);
  const defaults: DeliveryEventInput = { orderId, version, status: "IN_TRANSIT", occurredAt: now, location: "", carrier: carrier ?? "", trackingNumber: trackingNumber ?? "", note: "" };
  const form = useForm<DeliveryEventInput>({ resolver: zodResolver(deliveryEventSchema), defaultValues: defaults });
  const { submit, formError } = useServerForm(form, addDeliveryEventAction, { successMessage: "Delivery event recorded", onSuccess: () => void setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) form.reset(defaults); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><MapPin className="size-4" /> Add delivery event</Button>
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Record delivery event</DialogTitle>
              <DialogDescription>A “Delivered” event also marks the order as delivered.</DialogDescription>
            </DialogHeader>
            <FormErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField<DeliveryEventInput> name="status" label="Delivery status" required options={(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"] as const).map((s) => ({ value: s, label: DELIVERY_STATUS_META[s].label }))} />
              <TextField<DeliveryEventInput> name="occurredAt" label="Date and time" type="datetime-local" required />
              <TextField<DeliveryEventInput> name="location" label="Location" />
              <TextField<DeliveryEventInput> name="carrier" label="Carrier" />
              <TextField<DeliveryEventInput> name="trackingNumber" label="Tracking number" />
              <TextareaField<DeliveryEventInput> name="note" label="Delivery note" rows={2} className="sm:col-span-2" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Record event
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
