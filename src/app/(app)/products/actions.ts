"use server";

import { revalidatePath } from "next/cache";
import type { ProductStatus } from "@prisma/client";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { archiveProduct, createProduct, setProductStatus, updateProduct } from "@/server/services/products";

export async function createProductAction(input: unknown) {
  return runAction(async () => {
    const p = await createProduct(await getContext(), input);
    revalidatePath("/products");
    return { id: p.id };
  });
}

export async function updateProductAction(input: unknown) {
  return runAction(async () => {
    const p = await updateProduct(await getContext(), input);
    revalidatePath("/products");
    revalidatePath(`/products/${p.id}`);
    return { id: p.id };
  });
}

export async function setProductStatusAction(id: string, status: ProductStatus) {
  return runAction(async () => {
    await setProductStatus(await getContext(), id, status);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
  }, status === "ACTIVE" ? "Product activated" : "Product deactivated");
}

export async function archiveProductAction(id: string) {
  return runAction(async () => {
    await archiveProduct(await getContext(), id);
    revalidatePath("/products");
  }, "Product archived");
}
