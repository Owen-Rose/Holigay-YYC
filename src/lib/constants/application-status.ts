/**
 * Valid application statuses
 */
export const APPLICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'waitlisted',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
