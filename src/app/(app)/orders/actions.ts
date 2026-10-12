"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { addDeliveryEvent, archiveOrder, changeOrderStatus, createOrder, updateOrder } from "@/server/services/orders";

const touch = (id?: string) => {
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
  revalidatePath("/");
};

export async function createOrderAction(input: unknown) {
  return runAction(async () => {
    const o = await createOrder(await getContext(), input);
    touch();
    revalidatePath(`/accounts/${o.accountId}`);
    return { id: o.id };
  });
}
export async function updateOrderAction(input: unknown) {
  return runAction(async () => {
    const r = await updateOrder(await getContext(), input);
    touch(r.id);
    return r;
  });
}
export async function changeOrderStatusAction(input: unknown) {
  return runAction(async () => {
    const r = await changeOrderStatus(await getContext(), input);
    touch(r.id);
    return r;
  }, "Order status updated");
}
export async function addDeliveryEventAction(input: unknown) {
  return runAction(async () => {
    const e = await addDeliveryEvent(await getContext(), input);
    touch(e.orderId);
    return { id: e.id };
  }, "Delivery event recorded");
}
export async function archiveOrderAction(id: string) {
  return runAction(async () => {
    await archiveOrder(await getContext(), id);
    touch();
  }, "Order archived");
}
