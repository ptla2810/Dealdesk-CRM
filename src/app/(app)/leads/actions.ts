"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { addDiscussion, archiveLead, assignLead, changeLeadStage, convertLead, createLead, updateLead } from "@/server/services/leads";
import { checkAccountDuplicates } from "@/server/services/accounts";

const touch = (id?: string) => {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
  revalidatePath("/");
};

export async function createLeadAction(input: unknown) {
  return runAction(async () => {
    const lead = await createLead(await getContext(), input);
    touch();
    return { id: lead.id };
  });
}

export async function updateLeadAction(input: unknown) {
  return runAction(async () => {
    const r = await updateLead(await getContext(), input);
    touch(r.id);
    return r;
  });
}

export async function changeLeadStageAction(input: unknown) {
  return runAction(async () => {
    const r = await changeLeadStage(await getContext(), input);
    touch(r.id);
    return r;
  }, "Stage updated");
}

export async function assignLeadAction(input: unknown) {
  return runAction(async () => {
    const r = await assignLead(await getContext(), input);
    touch(r.id);
    return r;
  }, "Lead reassigned");
}

export async function addDiscussionAction(input: unknown) {
  return runAction(async () => {
    const d = await addDiscussion(await getContext(), input);
    touch(d.leadId);
    if (d.meetingId) revalidatePath(`/meetings/${d.meetingId}`);
    return { id: d.id };
  }, "Discussion update added");
}

export async function convertLeadAction(input: unknown) {
  return runAction(async () => {
    const r = await convertLead(await getContext(), input);
    touch(r.id);
    revalidatePath("/accounts");
    revalidatePath("/contacts");
    return r;
  }, "Lead converted");
}

export async function archiveLeadAction(id: string) {
  return runAction(async () => {
    await archiveLead(await getContext(), id);
    touch(id);
  }, "Lead archived");
}

export async function checkCompanyDuplicatesAction(input: { name: string; email?: string; phone?: string }) {
  return runAction(async () => checkAccountDuplicates(await getContext(), input));
}
