import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { catalogOptions } from "@/server/services/products";
import { PageHeader } from "@/components/data/page-header";
import { ProductForm } from "@/features/products/product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await pageContext("product.create");
  const { categories, taxRates } = await catalogOptions(ctx);
  return (
    <>
      <PageHeader title="New product" breadcrumbs={[{ label: "Products", href: "/products" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <ProductForm
          mode="create"
          defaults={{ currency: ctx.org.baseCurrency }}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          taxRates={taxRates.filter((t) => t.isActive).map((t) => ({ value: t.id, label: `${t.name} (${t.ratePercent.toString()}%)` }))}
          taxEnabled={ctx.settings.pricing.taxEnabled}
          cancelHref="/products"
        />
      </div>
    </>
  );
}
