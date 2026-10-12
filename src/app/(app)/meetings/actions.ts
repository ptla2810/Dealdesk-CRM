"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { addMinutes, archiveMeeting, createMeeting, updateActionItemStatus, updateMeeting } from "@/server/services/meetings";

const touch = (id?: string, leadId?: string | null, accountId?: string | null) => {
  revalidatePath("/meetings");
  revalidatePath("/meetings/follow-ups");
  if (id) revalidatePath(`/meetings/${id}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
};

export async function createMeetingAction(input: unknown) {
  return runAction(async () => {
    const m = await createMeeting(await getContext(), input);
    touch(m.id, m.leadId, m.accountId);
    return { id: m.id };
  });
}

export async function updateMeetingAction(input: unknown) {
  return runAction(async () => {
    const m = await updateMeeting(await getContext(), input);
    touch(m.id, m.leadId, m.accountId);
    return { id: m.id };
  });
}

export async function addMinutesAction(input: unknown) {
  return runAction(async () => {
    const m = await addMinutes(await getContext(), input);
    touch(m.meetingId);
    return { id: m.id };
  }, "Minutes recorded");
}

export async function updateActionItemStatusAction(id: string, status: string) {
  return runAction(async () => {
    const item = await updateActionItemStatus(await getContext(), { id, status });
    touch(item.meetingId);
  }, "Action item updated");
}

export async function archiveMeetingAction(id: string) {
  return runAction(async () => {
    await archiveMeeting(await getContext(), id);
    touch();
  }, "Meeting archived");
}
