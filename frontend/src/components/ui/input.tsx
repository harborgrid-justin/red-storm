"use client"

import * as React from "react"
import { TextInput } from "@carbon/react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<typeof TextInput> {
  className?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(className)}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }