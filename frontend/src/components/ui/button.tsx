"use client"

import * as React from "react"
import { Button as CarbonButton } from "@carbon/react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ComponentProps<typeof CarbonButton> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'danger--tertiary' | 'danger--ghost'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <CarbonButton
        ref={ref}
        kind={variant}
        size={size}
        className={cn(className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }