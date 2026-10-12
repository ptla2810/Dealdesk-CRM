"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { addTicketMessage, archiveTicket, assignTicket, changeTicketPriority, changeTicketStatus, createTicket, updateTicket } from "@/server/services/tickets";

const touch = (id?: string) => {
  revalidatePath("/tickets");
  if (id) revalidatePath(`/tickets/${id}`);
};

export async function createTicketAction(input: unknown) {
  return runAction(async () => {
    const t = await createTicket(await getContext(), input);
    touch();
    return { id: t.id };
  });
}
export async function updateTicketAction(input: unknown) {
  return runAction(async () => {
    const r = await updateTicket(await getContext(), input);
    touch(r.id);
    return r;
  });
}
export async function changeTicketStatusAction(input: unknown) {
  return runAction(async () => {
    const r = await changeTicketStatus(await getContext(), input);
    touch(r.id);
    return r;
  }, "Status updated");
}
export async function changeTicketPriorityAction(input: unknown) {
  return runAction(async () => {
    const r = await changeTicketPriority(await getContext(), input);
    touch(r.id);
    return r;
  }, "Priority updated");
}
export async function assignTicketAction(input: unknown) {
  return runAction(async () => {
    const r = await assignTicket(await getContext(), input);
    touch(r.id);
    return r;
  }, "Assignment updated");
}
export async function addTicketMessageAction(input: unknown) {
  return runAction(async () => {
    const m = await addTicketMessage(await getContext(), input);
    touch(m.ticketId);
    return { id: m.id, delivery: m.delivery };
  });
}
export async function archiveTicketAction(id: string) {
  return runAction(async () => {
    await archiveTicket(await getContext(), id);
    touch();
  }, "Ticket archived");
}
