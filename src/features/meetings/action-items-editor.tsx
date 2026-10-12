"use client";

import { useFieldArray, useFormContext, get } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, type Option } from "@/components/forms/fields";

/** Repeating rows of action items (description, owner, due date) inside a MOM form. */
export function ActionItemsEditor({ name, users, defaultOwner }: { name: string; users: Option[]; defaultOwner: string }) {
  const { control, register, formState } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Action items</span>
        <Button type="button" variant="outline" size="xs" onClick={() => append({ description: "", ownerId: defaultOwner, dueDate: "" })}>
          <Plus className="size-3.5" /> Add action item
        </Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-muted-foreground">No action items. Add one for each commitment made in the meeting.</p>}
      {fields.map((f, i) => {
        const err = (k: string) => (get(formState.errors, `${name}.${i}.${k}`) as { message?: string } | undefined)?.message;
        return (
          <div key={f.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_180px_150px_auto]">
            <div>
              <label className="sr-only" htmlFor={`${name}-${i}-d`}>Action item</label>
              <Input id={`${name}-${i}-d`} placeholder="What needs to be done?" aria-invalid={!!err("description")} {...register(`${name}.${i}.description`)} />
              {err("description") && <p className="mt-1 text-xs text-destructive">{err("description")}</p>}
            </div>
            <div>
              <label className="sr-only" htmlFor={`${name}-${i}-o`}>Owner</label>
              <select id={`${name}-${i}-o`} className={selectClass} {...register(`${name}.${i}.ownerId`)}>
                {users.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="sr-only" htmlFor={`${name}-${i}-due`}>Due date</label>
              <Input id={`${name}-${i}-due`} type="date" {...register(`${name}.${i}.dueDate`)} />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="Remove action item">
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
