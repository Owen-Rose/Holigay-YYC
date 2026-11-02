import { z } from 'zod';

// =============================================================================
// Product links — where the organizers can view a vendor's products
//
// Spec 011 (FR-011, FR-012, research R2): one rule for the apply form and the
// profile form. Values are trimmed, given an https:// prefix when they have no
// http(s) scheme, and must then be an absolute web address of at most 500
// characters. Link 1 is required; Link 2 and Link 3 are optional. The stored
// shape is the compacted array (blanks dropped, order kept).
//
// submit_public_application re-checks the shape only (≤ 3, ^https?://\S+$,
// ≤ 500 — migration 015); the normalization lives here, once.
// =============================================================================

export const MAX_PRODUCT_LINKS = 3;
export const MAX_PRODUCT_LINK_LENGTH = 500;
export const PRODUCT_LINK_REQUIRED_MESSAGE =
  'Please add at least one link where we can view your products';
export const PRODUCT_LINK_INVALID_MESSAGE =
  'Please enter a web address, like instagram.com/yourshop';
export const PRODUCT_LINK_TOO_LONG_MESSAGE = `Each link must be ${MAX_PRODUCT_LINK_LENGTH} characters or fewer`;

const HTTP_SCHEME = /^https?:\/\//i;

/** Trims; prepends https:// when the value has no http(s):// scheme. '' stays ''. */
export function normalizeProductLink(raw: string): string {
  const value = raw.trim();
  if (value === '') return '';
  return HTTP_SCHEME.test(value) ? value : `https://${value}`;
}

/**
 * True when `value` is an absolute http(s) address: `new URL()` parses it, the
 * protocol is http: or https:, the hostname contains a dot, there is no
 * whitespace and no user:password part, and it is at most 500 characters.
 *
 * The credentials check is what refuses `mailto:a@b.c`: once prefixed it reads
 * as `https://mailto:a@b.c`, which `new URL()` accepts as user `mailto`,
 * password `a`, host `b.c`.
 */
export function isWebAddress(value: string): boolean {
  if (value.length === 0 || value.length > MAX_PRODUCT_LINK_LENGTH) return false;
  if (/\s/.test(value)) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return url.hostname.includes('.');
}

const withinLength = (value: string) => value.length <= MAX_PRODUCT_LINK_LENGTH;

/** One optional slot: blank is fine, anything else must be a web address. */
const optionalLink = z
  .string()
  .trim()
  .transform(normalizeProductLink)
  .refine(withinLength, { message: PRODUCT_LINK_TOO_LONG_MESSAGE, abort: true })
  .refine((value) => value === '' || isWebAddress(value), PRODUCT_LINK_INVALID_MESSAGE);

export const productLinkFieldsSchema = z.object({
  link1: z
    .string()
    .trim()
    .min(1, PRODUCT_LINK_REQUIRED_MESSAGE)
    .transform(normalizeProductLink)
    .refine(withinLength, { message: PRODUCT_LINK_TOO_LONG_MESSAGE, abort: true })
    .refine(isWebAddress, PRODUCT_LINK_INVALID_MESSAGE),
  link2: optionalLink,
  link3: optionalLink,
});

export type ProductLinkFields = z.infer<typeof productLinkFieldsSchema>;

/** [link1, link2, link3] with blanks dropped, order kept — the stored shape (FR-012). */
export function compactProductLinks(fields: ProductLinkFields): string[] {
  return [fields.link1, fields.link2, fields.link3].filter((link) => link !== '');
}

/** Stored array → the three form slots ('' for absent) — profile defaults. */
export function toProductLinkFields(links: readonly string[]): ProductLinkFields {
  return {
    link1: links[0] ?? '',
    link2: links[1] ?? '',
    link3: links[2] ?? '',
  };
}
