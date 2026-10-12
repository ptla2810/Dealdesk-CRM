import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { catalogOptions, getProduct } from "@/server/services/products";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { ProductForm } from "@/features/products/product-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("product.edit");
  const { id } = await params;
  const [p, { categories, taxRates }] = await Promise.all([orNotFound(getProduct(ctx, id)), catalogOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${p.name}`} breadcrumbs={[{ label: "Products", href: "/products" }, { label: p.sku, href: `/products/${p.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <ProductForm
          mode="edit"
          defaults={{
            id: p.id,
            name: p.name,
            sku: p.sku,
            categoryId: p.categoryId ?? "",
            shortDescription: p.shortDescription ?? "",
            description: p.description ?? "",
            unitOfMeasure: p.unitOfMeasure,
            listPrice: p.listPrice.toFixed(2),
            currency: p.currency,
            taxRateId: p.taxRateId ?? "",
            status: p.status,
            imageUrl: p.imageUrl ?? "",
          }}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          taxRates={taxRates.filter((t) => t.isActive || t.id === p.taxRateId).map((t) => ({ value: t.id, label: `${t.name} (${t.ratePercent.toString()}%)` }))}
          taxEnabled={ctx.settings.pricing.taxEnabled}
          cancelHref={`/products/${p.id}`}
        />
      </div>
    </>
  );
}
