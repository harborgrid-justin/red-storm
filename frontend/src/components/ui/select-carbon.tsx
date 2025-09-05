"use client"

import * as React from 'react'
import { Dropdown } from '@carbon/react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.ComponentProps<typeof Dropdown> {
  className?: string
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <Dropdown
        ref={ref}
        className={cn(className)}
        {...props}
      />
    )
  }
)
Select.displayName = "Select"

export { Select }