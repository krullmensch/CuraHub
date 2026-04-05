import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { de } from "date-fns/locale"
import "react-day-picker/style.css"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      locale={de}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        today: "border-blue-400",
        selected: `${defaults.selected} bg-blue-600 text-white`,
        chevron: `${defaults.chevron} fill-zinc-400`,
        day_button: `${defaults.day_button} text-zinc-300 hover:bg-zinc-800`,
        month_caption: `${defaults.month_caption} text-zinc-200`,
        weekday: `${defaults.weekday} text-zinc-500`,
        outside: `${defaults.outside} text-zinc-600`,
        disabled: `${defaults.disabled} text-zinc-700`,
        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
