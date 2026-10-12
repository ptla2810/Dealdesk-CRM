"use client";

import { useId, useState } from "react";
import { Controller, get, useFormContext, type FieldValues, type Path } from "react-hook-form";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Base<T extends FieldValues> = {
  name: Path<T>;
  label: string;
  required?: boolean;
  description?: string;
  className?: string;
  disabled?: boolean;
};

export type Option = { value: string; label: string; hint?: string };

function useFieldMeta(name: string) {
  const { formState } = useFormContext();
  const error = get(formState.errors, name) as { message?: string } | undefined;
  const id = useId();
  return { id, error: error?.message, errorId: `${id}-error`, descId: `${id}-desc` };
}

export function FieldShell({
  id,
  label,
  required,
  description,
  error,
  errorId,
  descId,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  errorId: string;
  descId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {description && !error && (
        <p id={descId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const aria = (m: ReturnType<typeof useFieldMeta>, required?: boolean, description?: string) => ({
  id: m.id,
  "aria-invalid": m.error ? true : undefined,
  "aria-required": required || undefined,
  "aria-describedby": m.error ? m.errorId : description ? m.descId : undefined,
});

export function TextField<T extends FieldValues>({ name, label, required, description, className, disabled, type = "text", placeholder, autoComplete, inputMode }: Base<T> & { type?: string; placeholder?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  const { register } = useFormContext<T>();
  const m = useFieldMeta(name);
  return (
    <FieldShell {...m} label={label} required={required} description={description} className={className}>
      <Input type={type} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} disabled={disabled} {...aria(m, required, description)} {...register(name)} />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>({ name, label, required, description, className, disabled, rows = 3, placeholder }: Base<T> & { rows?: number; placeholder?: string }) {
  const { register } = useFormContext<T>();
  const m = useFieldMeta(name);
  return (
    <FieldShell {...m} label={label} required={required} description={description} className={className}>
      <Textarea rows={rows} placeholder={placeholder} disabled={disabled} {...aria(m, required, description)} {...register(name)} />
    </FieldShell>
  );
}

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive";

export function SelectField<T extends FieldValues>({ name, label, required, description, className, disabled, options, placeholder }: Base<T> & { options: Option[]; placeholder?: string }) {
  const { register } = useFormContext<T>();
  const m = useFieldMeta(name);
  return (
    <FieldShell {...m} label={label} required={required} description={description} className={className}>
      <select className={selectClass} disabled={disabled} {...aria(m, required, description)} {...register(name)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField<T extends FieldValues>({ name, label, description, className, disabled }: Omit<Base<T>, "required">) {
  const { control } = useFormContext<T>();
  const m = useFieldMeta(name);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={cn("flex items-start gap-2.5", className)}>
          <input
            type="checkbox"
            id={m.id}
            className="mt-0.5 size-4 rounded accent-[var(--primary)]"
            checked={Boolean(field.value)}
            onChange={(e) => field.onChange(e.target.checked)}
            onBlur={field.onBlur}
            disabled={disabled}
            aria-describedby={description ? m.descId : undefined}
          />
          <div>
            <Label htmlFor={m.id} className="font-normal">
              {label}
            </Label>
            {description && (
              <p id={m.descId} className="text-xs text-muted-foreground">
                {description}
              </p>
            )}
            {m.error && <p className="text-xs text-destructive">{m.error}</p>}
          </div>
        </div>
      )}
    />
  );
}

/** Searchable single-select for large option lists (accounts, leads, products …). */
export function ComboboxField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  className,
  disabled,
  options,
  placeholder = "Select…",
  allowClear = true,
  onSelected,
}: Base<T> & { options: Option[]; placeholder?: string; allowClear?: boolean; onSelected?: (value: string) => void }) {
  const { control } = useFormContext<T>();
  const m = useFieldMeta(name);
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const selected = options.find((o) => o.value === field.value);
        return (
          <FieldShell {...m} label={label} required={required} description={description} className={className}>
            <Popover open={open} onOpenChange={setOpen}>
              <div className="relative">
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={`${m.id}-list`}
                    disabled={disabled}
                    {...aria(m, required, description)}
                    className={cn(selectClass, "flex items-center justify-between gap-2 pr-8 text-left", !selected && "text-muted-foreground")}
                  >
                    <span className="truncate">{selected ? selected.label : placeholder}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                {allowClear && selected && !disabled && (
                  <button
                    type="button"
                    aria-label={`Clear ${label}`}
                    onClick={() => {
                      field.onChange("");
                      onSelected?.("");
                    }}
                    className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <PopoverContent id={`${m.id}-list`} className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
                  <CommandList>
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup>
                      {options.map((o) => (
                        <CommandItem
                          key={o.value}
                          value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                          onSelect={() => {
                            field.onChange(o.value);
                            onSelected?.(o.value);
                            setOpen(false);
                          }}
                        >
                          <Check className={cn("size-4", o.value === field.value ? "opacity-100" : "opacity-0")} />
                          <div className="min-w-0">
                            <div className="truncate">{o.label}</div>
                            {o.hint && <div className="truncate text-xs text-muted-foreground">{o.hint}</div>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </FieldShell>
        );
      }}
    />
  );
}

/** Searchable multi-select (e.g. meeting contacts). */
export function MultiComboboxField<T extends FieldValues>({ name, label, required, description, className, options, placeholder = "Select…" }: Base<T> & { options: Option[]; placeholder?: string }) {
  const { control } = useFormContext<T>();
  const m = useFieldMeta(name);
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const values: string[] = Array.isArray(field.value) ? field.value : [];
        const toggle = (v: string) => field.onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
        return (
          <FieldShell {...m} label={label} required={required} description={description} className={className}>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button type="button" role="combobox" aria-expanded={open} aria-controls={`${m.id}-list`} {...aria(m, required, description)} className={cn(selectClass, "flex items-center justify-between text-left", !values.length && "text-muted-foreground")}>
                  <span className="truncate">{values.length ? `${values.length} selected` : placeholder}</span>
                  <ChevronsUpDown className="size-4 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent id={`${m.id}-list`} className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
                  <CommandList>
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup>
                      {options.map((o) => (
                        <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""} ${o.value}`} onSelect={() => toggle(o.value)}>
                          <Check className={cn("size-4", values.includes(o.value) ? "opacity-100" : "opacity-0")} />
                          <div className="min-w-0">
                            <div className="truncate">{o.label}</div>
                            {o.hint && <div className="truncate text-xs text-muted-foreground">{o.hint}</div>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {values.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {values.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                    {options.find((o) => o.value === v)?.label ?? "Unknown"}
                    <button type="button" aria-label="Remove" onClick={() => toggle(v)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </FieldShell>
        );
      }}
    />
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
