import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-white/20",
  {
    variants: {
      size: {
        default: "h-10 px-4 py-2",
        icon: "size-10",
      },
      variant: {
        default: "bg-white text-black hover:bg-stone-100",
        ghost:
          "border border-white/8 bg-white/[0.04] text-stone-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl hover:bg-white/[0.07]",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({
  className,
  size,
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
