"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { runAction } from "@/server/action";
import { adminSetPassword, changePassword, createUser, updateProfile, updateUser } from "@/server/services/users";
import {
  addCategory,
  addLeadSource,
  addTaxRate,
  createRole,
  toggleLeadSource,
  toggleTaxRate,
  updateOrganization,
  updateRolePermissions,
  updateWorkflow,
} from "@/server/services/settings";

const touch = (p: string) => revalidatePath(p, "layout");

export async function createUserAction(input: unknown) {
  return runAction(async () => {
    const r = await createUser(await getContext(), input);
    touch("/settings/users");
    return r;
  }, "User created");
}
export async function updateUserAction(input: unknown) {
  return runAction(async () => {
    await updateUser(await getContext(), input);
    touch("/settings/users");
  }, "User updated");
}
export async function adminSetPasswordAction(input: unknown) {
  return runAction(async () => {
    await adminSetPassword(await getContext(), input);
    touch("/settings/users");
  }, "Password updated. The user has been signed out everywhere.");
}
export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    await updateProfile(await getContext(), input);
    touch("/");
  }, "Profile updated");
}
export async function changePasswordAction(input: unknown) {
  return runAction(async () => {
    await changePassword(await getContext(), input);
  }, "Password changed. Please sign in again.");
}
export async function createRoleAction(input: unknown) {
  return runAction(async () => {
    const r = await createRole(await getContext(), input);
    touch("/settings/roles");
    return { id: r.id };
  }, "Role created");
}
export async function updateRolePermissionsAction(input: unknown) {
  return runAction(async () => {
    await updateRolePermissions(await getContext(), input);
    touch("/");
  }, "Permissions saved");
}
export async function addLeadSourceAction(input: unknown) {
  return runAction(async () => {
    await addLeadSource(await getContext(), input);
    touch("/settings/configuration");
  }, "Lead source added");
}
export async function toggleLeadSourceAction(id: string, isActive: boolean) {
  return runAction(async () => {
    await toggleLeadSource(await getContext(), id, isActive);
    touch("/settings/configuration");
  }, isActive ? "Lead source activated" : "Lead source deactivated");
}
export async function addCategoryAction(input: unknown) {
  return runAction(async () => {
    await addCategory(await getContext(), input);
    touch("/settings/configuration");
  }, "Category added");
}
export async function addTaxRateAction(input: unknown) {
  return runAction(async () => {
    await addTaxRate(await getContext(), input);
    touch("/settings/configuration");
  }, "Tax rate added");
}
export async function toggleTaxRateAction(id: string, isActive: boolean) {
  return runAction(async () => {
    await toggleTaxRate(await getContext(), id, isActive);
    touch("/settings/configuration");
  }, isActive ? "Tax rate activated" : "Tax rate deactivated");
}
export async function updateOrganizationAction(input: unknown) {
  return runAction(async () => {
    await updateOrganization(await getContext(), input);
    touch("/");
  }, "Organization updated");
}
export async function updateWorkflowAction(input: unknown) {
  return runAction(async () => {
    await updateWorkflow(await getContext(), input);
    touch("/");
  }, "Workflow settings saved");
}
