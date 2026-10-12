"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { archiveContact, createContact, updateContact } from "@/server/services/contacts";

export async function createContactAction(input: unknown) {
  return runAction(async () => {
    const c = await createContact(await getContext(), input);
    revalidatePath("/contacts");
    if (c.accountId) revalidatePath(`/accounts/${c.accountId}`);
    return { id: c.id };
  });
}

export async function updateContactAction(input: unknown) {
  return runAction(async () => {
    const c = await updateContact(await getContext(), input);
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${c.id}`);
    return { id: c.id };
  });
}

export async function archiveContactAction(id: string) {
  return runAction(async () => {
    await archiveContact(await getContext(), id);
    revalidatePath("/contacts");
  }, "Contact archived");
}
