"use client";

import { FormProvider, get, useFieldArray, useForm, type Resolver, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { orderCreateSchema, orderUpdateSchema, type OrderCreateInput } from "@/lib/validation/order";
import { ComboboxField, FormSection, SelectField, TextField, TextareaField, selectClass, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeOrder } from "@/lib/order-math";
import { formatMoney } from "@/lib/format";
import { COMMON_CURRENCIES } from "@/lib/constants";
import { createOrderAction, updateOrderAction } from "@/app/(app)/orders/actions";

export type OrderProduct = { id: string; name: string; sku: string; listPrice: string; currency: string; unitOfMeasure: string; taxRatePercent: string; taxName: string | null; status: string };
type Values = OrderCreateInput & { id?: string; version?: number };

export function OrderForm({
  mode,
  defaults,
  accounts,
  leads,
  owners,
  products,
  canChooseOwner,
  canOverridePrice,
  pricing,
  cancelHref,
}: {
  mode: "create" | "edit";
  defaults: Partial<Values>;
  accounts: (Option & { address: string })[];
  leads: (Option & { accountId: string | null })[];
  owners: Option[];
  products: OrderProduct[];
  canChooseOwner: boolean;
  canOverridePrice: boolean;
  pricing: { discountsEnabled: boolean; maxDiscountPercent: number; taxEnabled: boolean };
  cancelHref: string;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? orderCreateSchema : orderUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: {
      accountId: "",
      leadId: "",
      ownerId: "",
      orderDate: "",
      expectedDeliveryDate: "",
      billingAddress: "",
      shippingAddress: "",
      currency: "USD",
      notes: "",
      lines: [],
      ...defaults,
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createOrderAction(v) : updateOrderAction(v)), {
    successMessage: mode === "create" ? "Order created as draft" : "Order updated",
    onSuccess: (d: { id: string }) => `/orders/${d.id}`,
  });

  const currency = useWatch({ control: form.control, name: "currency" });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const lines = useWatch({ control: form.control, name: "lines" });
  const productById = new Map(products.map((p) => [p.id, p]));
  const available = products.filter((p) => canOverridePrice || p.currency === currency);
  const taxOf = (pid: string) => (pricing.taxEnabled ? (productById.get(pid)?.taxRatePercent ?? "0") : "0");
  const valid = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? v : "0");
  // Preview only — the server recomputes every amount from the catalogue before saving.
  const preview = computeOrder(lines.map((l) => ({ quantity: valid(l.quantity), unitPrice: valid(l.unitPrice), discountPercent: valid(l.discountPercent), taxRatePercent: taxOf(l.productId) })));
  const lineErr = (i: number, k: string) => (get(form.formState.errors, `lines.${i}.${k}`) as { message?: string } | undefined)?.message;
  const linesErr = (form.formState.errors.lines as { message?: string; root?: { message?: string } } | undefined);

  const onProduct = (i: number, pid: string) => {
    const p = productById.get(pid);
    form.setValue(`lines.${i}.productId`, pid, { shouldValidate: true });
    if (p) form.setValue(`lines.${i}.unitPrice`, p.listPrice);
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Order">
          <ComboboxField
            name="accountId"
            label="Account"
            required
            options={accounts}
            allowClear={false}
            onSelected={(id) => {
              const a = accounts.find((x) => x.value === id);
              if (a) {
                if (!form.getValues("billingAddress")) form.setValue("billingAddress", a.address);
                if (!form.getValues("shippingAddress")) form.setValue("shippingAddress", a.address);
              }
              form.setValue("leadId", "");
            }}
          />
          <ComboboxField name="leadId" label="Related lead" options={leads.filter((l) => l.accountId && l.accountId === accountId)} placeholder={accountId ? "Converted leads of this account" : "Select an account first"} />
          <TextField name="orderDate" label="Order date" type="date" required />
          <TextField name="expectedDeliveryDate" label="Expected delivery date" type="date" />
          <SelectField name="ownerId" label="Order owner" required options={owners} disabled={!canChooseOwner} />
          <SelectField name="currency" label="Currency" required options={COMMON_CURRENCIES.map((c) => ({ value: c, label: c }))} description={canOverridePrice ? undefined : "Only products priced in this currency can be added."} />
          <TextareaField name="billingAddress" label="Billing address" required rows={2} />
          <TextareaField name="shippingAddress" label="Shipping address" required rows={2} />
        </FormSection>

        <fieldset className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
          <legend className="sr-only">Product line items</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Product line items</h2>
              <p className="text-sm text-muted-foreground">
                {canOverridePrice ? "You may negotiate unit prices." : "Unit prices come from the catalogue."}{" "}
                {pricing.discountsEnabled ? `Discounts up to ${pricing.maxDiscountPercent}%.` : "Discounts are disabled."} {pricing.taxEnabled ? "Tax follows each product's tax class." : "Tax is disabled."}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", quantity: "1", unitPrice: "", discountPercent: "0" })}>
              <Plus className="size-4" /> Add product
            </Button>
          </div>
          {(linesErr?.message || linesErr?.root?.message) && <p role="alert" className="text-sm text-destructive">{linesErr.message ?? linesErr.root?.message}</p>}
          {fields.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No products yet. Add at least one line.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Product</th>
                    <th className="w-24 font-medium">Qty</th>
                    <th className="w-32 font-medium">Unit price</th>
                    {pricing.discountsEnabled && <th className="w-24 font-medium">Disc. %</th>}
                    <th className="w-20 text-right font-medium">Tax</th>
                    <th className="w-32 text-right font-medium">Line total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => {
                    const l = lines[i];
                    const p = l ? productById.get(l.productId) : undefined;
                    const t = preview.lines[i];
                    return (
                      <tr key={f.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-2">
                          <label className="sr-only" htmlFor={`line-${i}-p`}>Product</label>
                          <select id={`line-${i}-p`} className={selectClass} value={l?.productId ?? ""} onChange={(e) => onProduct(i, e.target.value)} aria-invalid={!!lineErr(i, "productId")}>
                            <option value="">Select product…</option>
                            {[...available, ...(p && !available.includes(p) ? [p] : [])].map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} ({o.sku}){o.currency !== currency ? ` — ${o.currency}` : ""}
                                {o.status !== "ACTIVE" ? " — inactive" : ""}
                              </option>
                            ))}
                          </select>
                          {p && <div className="mt-1 text-xs text-muted-foreground">List {formatMoney(p.listPrice, p.currency)} / {p.unitOfMeasure}</div>}
                          {lineErr(i, "productId") && <p className="mt-1 text-xs text-destructive">{lineErr(i, "productId")}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <Input aria-label="Quantity" inputMode="decimal" aria-invalid={!!lineErr(i, "quantity")} {...form.register(`lines.${i}.quantity`)} />
                          {lineErr(i, "quantity") && <p className="mt-1 text-xs text-destructive">{lineErr(i, "quantity")}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <Input aria-label="Unit price" inputMode="decimal" readOnly={!canOverridePrice} className={!canOverridePrice ? "bg-muted" : undefined} aria-invalid={!!lineErr(i, "unitPrice")} {...form.register(`lines.${i}.unitPrice`)} />
                          {lineErr(i, "unitPrice") && <p className="mt-1 text-xs text-destructive">{lineErr(i, "unitPrice")}</p>}
                        </td>
                        {pricing.discountsEnabled && (
                          <td className="py-2 pr-2">
                            <Input aria-label="Discount percent" inputMode="decimal" aria-invalid={!!lineErr(i, "discountPercent")} {...form.register(`lines.${i}.discountPercent`)} />
                            {lineErr(i, "discountPercent") && <p className="mt-1 text-xs text-destructive">{lineErr(i, "discountPercent")}</p>}
                          </td>
                        )}
                        <td className="py-2 text-right text-xs text-muted-foreground">{pricing.taxEnabled && p?.taxName ? `${p.taxRatePercent}%` : "—"}</td>
                        <td className="py-2 text-right tabular-nums">{t ? formatMoney(t.lineTotal.toString(), currency) : "—"}</td>
                        <td className="py-2 text-right">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => remove(i)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right tabular-nums">{formatMoney(preview.subtotal.toString(), currency)}</dd>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="text-right tabular-nums">−{formatMoney(preview.discountTotal.toString(), currency)}</dd>
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-right tabular-nums">{formatMoney(preview.taxTotal.toString(), currency)}</dd>
            <dt className="border-t pt-1 font-semibold">Total</dt>
            <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatMoney(preview.total.toString(), currency)}</dd>
          </dl>
          <p className="text-right text-xs text-muted-foreground">Preview — totals are recalculated on the server when you save.</p>
        </fieldset>

        <FormSection title="Notes">
          <TextareaField name="notes" label="Order notes" rows={3} className="sm:col-span-2" />
        </FormSection>
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create draft order" : "Save draft"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
