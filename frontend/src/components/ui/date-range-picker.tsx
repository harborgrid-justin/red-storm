'use client'

import React from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface DatePickerWithRangeProps {
  value?: { from: Date; to: Date } | null
  onChange: (range: { from: Date; to: Date } | null) => void
  placeholder?: string
  className?: string
}

export function DatePickerWithRange({
  value,
  onChange,
  placeholder = "Pick a date range",
  className
}: DatePickerWithRangeProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleSelect = (range: { from: Date | undefined; to: Date | undefined } | undefined) => {
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to })
      setIsOpen(false)
    } else if (range?.from) {
      // If only 'from' is selected, keep the popover open for 'to' selection
      onChange(null)
    } else {
      onChange(null)
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} -{" "}
                  {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from}
            selected={value ? { from: value.from, to: value.to } : undefined}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}