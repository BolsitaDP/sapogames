import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type DialogProps = {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
};

function Dialog({ children, onOpenChange, open }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={() => onOpenChange?.(false)}
      role="dialog"
    >
      {children}
    </div>
  );
}

function DialogContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-panel w-full max-w-lg rounded-[28px] p-5 sm:p-6",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-[family-name:var(--font-display)] text-2xl text-stone-100",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-stone-400", className)} {...props} />;
}

function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-6 flex items-center justify-end gap-3", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
