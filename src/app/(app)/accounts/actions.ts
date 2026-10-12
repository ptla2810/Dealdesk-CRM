"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { archiveAccount, checkAccountDuplicates, createAccount, updateAccount } from "@/server/services/accounts";

export async function createAccountAction(input: unknown) {
  return runAction(async () => {
    const a = await createAccount(await getContext(), input);
    revalidatePath("/accounts");
    return { id: a.id };
  });
}

export async function updateAccountAction(input: unknown) {
  return runAction(async () => {
    const a = await updateAccount(await getContext(), input);
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${a.id}`);
    return { id: a.id };
  });
}

export async function archiveAccountAction(id: string) {
  return runAction(async () => {
    await archiveAccount(await getContext(), id);
    revalidatePath("/accounts");
  }, "Account archived");
}

export async function checkAccountDuplicatesAction(input: { name: string; email?: string; phone?: string; country?: string }, excludeId?: string) {
  return runAction(async () => checkAccountDuplicates(await getContext(), input, excludeId));
}
