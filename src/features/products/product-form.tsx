"use client";

import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productCreateSchema, productUpdateSchema, type ProductCreateInput } from "@/lib/validation/product";
import { FormSection, SelectField, TextField, TextareaField, type Option } from "@/components/forms/fields";
import { FormActions, FormErrorBanner } from "@/components/forms/form-actions";
import { useServerForm } from "@/components/forms/use-server-form";
import { COMMON_CURRENCIES, PRODUCT_STATUSES, PRODUCT_STATUS_META } from "@/lib/constants";
import { createProductAction, updateProductAction } from "@/app/(app)/products/actions";

type Values = ProductCreateInput & { id?: string };

export function ProductForm({ mode, defaults, categories, taxRates, taxEnabled, cancelHref }: { mode: "create" | "edit"; defaults: Partial<Values>; categories: Option[]; taxRates: Option[]; taxEnabled: boolean; cancelHref: string }) {
  const form = useForm<Values>({
    resolver: zodResolver(mode === "create" ? productCreateSchema : productUpdateSchema) as unknown as Resolver<Values>,
    defaultValues: { name: "", sku: "", categoryId: "", shortDescription: "", description: "", unitOfMeasure: "Each", listPrice: "", currency: "USD", taxRateId: "", status: "ACTIVE", imageUrl: "", ...defaults },
  });
  const { submit, formError } = useServerForm(form, (v) => (mode === "create" ? createProductAction(v) : updateProductAction(v)), {
    successMessage: mode === "create" ? "Product created" : "Product updated",
    onSuccess: (d: { id: string }) => `/products/${d.id}`,
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6" noValidate>
        <FormErrorBanner message={formError} />
        <FormSection title="Product">
          <TextField name="name" label="Product name" required />
          <TextField name="sku" label="SKU" required description="Must be unique (case-insensitive)." />
          <SelectField name="categoryId" label="Category" options={categories} placeholder="Uncategorized" />
          <SelectField name="status" label="Availability status" required options={PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_META[s].label }))} />
          <TextField name="shortDescription" label="Short description" className="sm:col-span-2" />
          <TextareaField name="description" label="Detailed description" rows={4} className="sm:col-span-2" />
          <TextField name="imageUrl" label="Image URL" placeholder="https://…" description="Optional https link to a product image." className="sm:col-span-2" />
        </FormSection>
        <FormSection title="Pricing" description="Order lines snapshot these values; later catalogue changes never alter existing orders.">
          <TextField name="listPrice" label="List price" required inputMode="decimal" />
          <SelectField name="currency" label="Currency" required options={COMMON_CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <TextField name="unitOfMeasure" label="Unit of measure" required placeholder="Each, Box, Kg…" />
          <SelectField
            name="taxRateId"
            label="Tax classification"
            options={taxRates}
            placeholder="No tax"
            description={taxEnabled ? "Configure tax classes in Settings → Catalogue." : "Tax is currently disabled in Settings → Workflows."}
          />
        </FormSection>
        <FormActions pending={form.formState.isSubmitting} submitLabel={mode === "create" ? "Create product" : "Save changes"} cancelHref={cancelHref} />
      </form>
    </FormProvider>
  );
}
