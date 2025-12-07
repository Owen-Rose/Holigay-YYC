import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  description?: string
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId()
    const checkboxId = id ?? generatedId

    return (
      <div className="flex items-start">
        <div className="flex h-5 items-center">
          <input
            type="checkbox"
            id={checkboxId}
            className={cn(
              'h-4 w-4 rounded border-gray-300',
              'text-blue-600 focus:ring-blue-500 focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        <div className="ml-3 text-sm">
          <label
            htmlFor={checkboxId}
            className={cn(
              'font-medium text-gray-700',
              props.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {label}
          </label>
          {description && (
            <p className="text-gray-500">{description}</p>
          )}
        </div>
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
