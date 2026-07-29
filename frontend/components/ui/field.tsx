import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Form primitives. Guidelines §5 for the class strings, §4 for the spacing
 * (`space-y-1.5` label-to-control, `space-y-4` between fields).
 *
 * Nothing here uses a hook, deliberately. An earlier draft had `Field` generate
 * its own id with `useId`, which would have pulled this whole module — and every
 * form built on it — into the client bundle for the sake of one string. The
 * caller passes an explicit id instead; it needs a matching `name` for the form
 * post anyway, so there is no extra identifier to invent.
 */

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border px-3 py-2 text-sm transition-colors",
        "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border px-3 py-2 text-sm transition-colors",
        "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("text-sm font-medium text-foreground", className)} {...props} />
  );
}

type FieldProps = {
  /** Must match the `id` of the control passed as `children`. */
  htmlFor: string;
  label: string;
  /** Helper text. Replaced by `error` when one is present. */
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
};

export function Field({ htmlFor, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {(error || hint) && (
        <p
          id={`${htmlFor}-message`}
          className={cn("text-xs", error ? "text-red-600" : "text-muted-foreground")}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
