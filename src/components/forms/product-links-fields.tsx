'use client';

import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import type { ProductLinkFields } from '@/lib/validations/product-links';

/** Heading above the three slots (spec 011 FR-010, Clarifications Q2: plain slots, Link 1 required). */
export const PRODUCT_LINKS_HEADING =
  'Where can we view your products? Website, Instagram, Facebook…';

const SLOTS = [
  { name: 'link1', label: 'Link 1 *' },
  { name: 'link2', label: 'Link 2' },
  { name: 'link3', label: 'Link 3' },
] as const;

type ProductLinksFieldsProps<T extends FieldValues & ProductLinkFields> = {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
};

/**
 * The product-link slots shared by the apply form and the profile form, so both
 * ask the same question with the same rule (spec 011 FR-010, FR-015).
 *
 * `type="text"`, not `url`: the browser's URL check would refuse
 * `instagram.com/x` before the schema adds the https:// prefix.
 */
export function ProductLinksFields<T extends FieldValues & ProductLinkFields>({
  register,
  errors,
}: ProductLinksFieldsProps<T>) {
  // Path<T> does not resolve concrete keys on a generic T; every T here has them.
  const linkErrors = errors as FieldErrors<ProductLinkFields>;

  return (
    <div className="space-y-4">
      <h3 className="text-foreground text-base font-medium">{PRODUCT_LINKS_HEADING}</h3>
      {SLOTS.map(({ name, label }) => (
        <Input
          key={name}
          label={label}
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="instagram.com/yourshop"
          error={linkErrors[name]?.message}
          {...register(name as Path<T>)}
        />
      ))}
    </div>
  );
}
