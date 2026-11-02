# Contract: Server Actions, Schemas and UI Surfaces

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31
**Files**: `src/lib/validations/product-links.ts` (new), `application.ts`, `vendor.ts`;
`src/lib/actions/answers.ts`, `vendors.ts`, `vendor-dashboard.ts`, `applications.ts`, `export.ts`;
`src/app/(public)/apply/page.tsx`, `_components/dynamic-application-form.tsx`;
`src/components/forms/product-links-fields.tsx` (new), `vendor-profile-form.tsx`;
`src/components/vendor/product-links-list.tsx` (new), `no-vendor-profile.tsx` (new); the two
detail pages; the four vendor-dashboard pages.
**Tested by**: the unit tests listed at the end (FR-024) and `security-test-matrix.md`.

Every user-visible string below is part of the acceptance criteria. Every action keeps its
existing response shape.

## 1. `src/lib/validations/product-links.ts` (new)

```ts
export const MAX_PRODUCT_LINKS = 3;
export const MAX_PRODUCT_LINK_LENGTH = 500;
export const PRODUCT_LINK_REQUIRED_MESSAGE = 'Please add at least one link where we can view your products';
export const PRODUCT_LINK_INVALID_MESSAGE = 'Please enter a web address, like instagram.com/yourshop';
export const PRODUCT_LINK_TOO_LONG_MESSAGE = `Each link must be ${MAX_PRODUCT_LINK_LENGTH} characters or fewer`;

/** Trims; prepends https:// when the value has no http(s):// scheme. '' stays ''. */
export function normalizeProductLink(raw: string): string;
/** True when `new URL(value)` parses with protocol http:/https:, a hostname containing '.', no whitespace, ≤ 500 chars. */
export function isWebAddress(value: string): boolean;

export const productLinkFieldsSchema = z.object({
  link1: z.string().trim().min(1, REQUIRED).transform(normalizeProductLink).refine((v) => v.length <= MAX_PRODUCT_LINK_LENGTH, TOO_LONG).refine(isWebAddress, INVALID),
  link2: z.string().trim().transform(normalizeProductLink).refine((v) => v.length <= MAX_PRODUCT_LINK_LENGTH, TOO_LONG).refine((v) => v === '' || isWebAddress(v), INVALID),
  link3: /* as link2 */,
});
export type ProductLinkFields = z.infer<typeof productLinkFieldsSchema>;

/** [link1, link2, link3] with blanks dropped, order kept — the stored shape (FR-012). */
export function compactProductLinks(fields: ProductLinkFields): string[];
/** Stored array → the three form slots ('' for absent) — profile defaults. */
export function toProductLinkFields(links: readonly string[]): ProductLinkFields;
```

The length refine runs *after* the `https://` prefix is added, so a value that crosses 500 only
after normalization gets `PRODUCT_LINK_TOO_LONG_MESSAGE` on its own field (FR-011) rather than a
generic RPC `22023`; `isWebAddress` keeps its own ≤ 500 check as defence in depth. The unit test
pins the boundary at 500 after normalization.

## 2. Schemas

| Schema | File | Shape after 011 |
|---|---|---|
| `vendorInfoSchema` | `validations/application.ts` | `{ businessName, contactName, email (trim, lower, email), description (≤ 1000 or '') } .extend(productLinkFieldsSchema.shape)`. `phone`, `website` and both regexes removed. `VendorInfo` type follows |
| `vendorProfileSchema` | `validations/vendor.ts` | `{ businessName, contactName, description } .extend(productLinkFieldsSchema.shape)`. Regexes removed. `VendorProfileInput` follows |
| removed | `validations/application.ts` | `applicationDetailsSchema`, `applicationFormSchema`, `applicationSubmitSchema`, `BOOTH_PREFERENCES`, `BoothPreference`, `ProductCategory`, `ApplicationDetails`, `ApplicationFormInput`, `ApplicationSubmitInput`; `PRODUCT_CATEGORIES`/`CATEGORY_LABELS` move to `src/lib/questionnaire/default-questions.ts` |
| kept | `validations/application.ts` | `ALLOWED_FILE_TYPES`, `FILE_TYPE_LABELS`, `MAX_FILE_SIZE`, `MAX_FILES`, `fileSchema`, `filesSchema`, `FileInput`, `AllowedFileType` (importers: `upload.ts`, `next-config.test.ts`) |

## 3. `submitDynamicApplication(rawInput)` — `src/lib/actions/answers.ts`

Unchanged steps keep their order; the changes:

| # | Step | Change |
|---|---|---|
| 1 | `submitDynamicApplicationSchema.safeParse` | `vendor` now validates `link1..3`, no `phone`/`website` |
| 1a | `const { data: { user } } = await supabase.auth.getUser()` | **new** — right after `createClient()`; `const email = user?.email?.toLowerCase() ?? vendor.email` (FR-002, research R7) |
| 7 | payload | `vendor: { business_name, contact_name, email, description: description \|\| null, product_links: compactProductLinks(vendor) }`, `answers`; **no** `legacy`, **no** `attachments` keys |
| 9 | confirmation mail | `to: email` (the account address when signed in) |
| — | error strings | the "This event uses the legacy form" refusal becomes `'This event is not accepting applications'` (the page no longer has a legacy branch; FR-018) |

Response type unchanged: `{ success, error, warning?, data: { applicationId } | null }`.

## 4. `updateVendorProfile(data)` — `src/lib/actions/vendors.ts`

| # | Step | Change |
|---|---|---|
| 1 | `vendorProfileSchema.safeParse` | trio validated; Link 1 required (Clarifications Q2) |
| 3 | vendor lookup | `resolveVendorId(supabase, user.id)` replaces the inline `user_profiles` read; `null` → `'No vendor profile linked to your account'` (unchanged string) |
| 4 | update | `{ business_name, contact_name, description: … \|\| null, product_links: compactProductLinks(parsed.data), updated_at }` — **no** `phone`, **no** `website` |

Response unchanged. The form keeps its Sonner toasts (`Profile updated` / the error).

## 5. Vendor loaders — `src/lib/actions/vendor-dashboard.ts`

- All four call `resolveVendorId(supabase, user.id)` after `getUser()`; their result shapes and
  error strings are unchanged.
- `getVendorProfile` selects `id, business_name, contact_name, email, product_links, description`;
  `VendorProfile` loses `phone`/`website`, gains `product_links: string[]`.
- `getVendorApplicationDetail` selects `vendor:vendors(business_name, contact_name, email,
  product_links, description)` and drops `booth_preference, product_categories,
  special_requirements` from the application select and from `VendorApplicationDetail`.

## 6. Organizer readers — `src/lib/actions/applications.ts`

- `submitApplication`, its `requireRole` import and `applicationSubmitSchema` import removed.
- `getApplications` and `getApplicationById` selects drop the three fixed-form columns and
  `phone, website`; add `product_links`. `ApplicationWithVendor.vendor` and
  `ApplicationDetail.vendor` carry `product_links: string[]`; the fixed-form fields leave both
  types. `dynamicAnswers` keeps its `mappedAnswers.length > 0 ? … : null` shape.

## 7. `exportApplicationsCSV(filters)` — `src/lib/actions/export.ts`

```ts
const EXPORT_HEADERS = [
  'Business Name', 'Contact Name', 'Email', 'Link 1', 'Link 2', 'Link 3',
  'Status', 'Submitted Date', 'Event', 'Organizer Notes', 'Business Description',
] as const;
```

Both branches use it (FR-014). Row: `[business_name, contact_name, email, product_links[0] ?? '',
product_links[1] ?? '', product_links[2] ?? '', status, formatDateTime(submitted_at, DATE_SHORT),
event?.name ?? '', organizer_notes, description]`. `formatCategories` removed. Select drops the
fixed-form columns and `phone, website`, adds `product_links`.

## 8. The apply page — `src/app/(public)/apply/page.tsx`

- After the event lookup: `const supabase = await createClient(); const { data: { user } } =
  await supabase.auth.getUser();` → `accountEmail={user?.email ?? null}` on the form.
- No questionnaire (FR-018): the card shows
  `This event is not accepting applications right now.` and the existing `← Back to events` link;
  no form. The `ApplicationPageClient` import and branch are gone.
- `src/app/(public)/apply/client.tsx` deleted.

## 9. `DynamicApplicationForm` — `apply/_components/dynamic-application-form.tsx`

| Prop | Type | Change |
|---|---|---|
| `eventId`, `eventName`, `questions` | as today | — |
| `accountEmail` | `string \| null` | **new** |

- `useForm<VendorFields>({ resolver: zodResolver(vendorInfoSchema), defaultValues: { email:
  accountEmail ?? '', link1: '', link2: '', link3: '' } })`.
- Email input: `label="Email *"`, `type="email"`, `readOnly={accountEmail !== null}`,
  `aria-readonly` likewise, `hint={accountEmail !== null ? ACCOUNT_EMAIL_HINT : undefined}` where
  `ACCOUNT_EMAIL_HINT = "Taken from your account. Applications are matched to this address."`
  (FR-006). The `Input` primitive already wires `aria-describedby` to the hint.
- Phone and Website inputs removed; `<ProductLinksFields register={register} errors={errors} />`
  rendered after Business Description inside the "Business Information" section (FR-010).
- Submit sends `vendor: data` (the trio included); compaction is the action's job.

## 10. `ProductLinksFields` — `src/components/forms/product-links-fields.tsx` (new, client)

```ts
export const PRODUCT_LINKS_HEADING = 'Where can we view your products? Website, Instagram, Facebook…';
type Props<T extends ProductLinkFields> = { register: UseFormRegister<T>; errors: FieldErrors<T> };
```

Renders `<h3>` with the heading (tokens: `text-foreground text-base font-medium`), then three
`Input`s: `label="Link 1 *"`, `label="Link 2"`, `label="Link 3"`, each `type="text"`
(not `url`: the browser's URL validation would refuse `instagram.com/x` before normalization),
`inputMode="url"`, `autoComplete="url"`, `placeholder="instagram.com/yourshop"`,
`error={errors.linkN?.message}`. Labels bind through the primitive's `useId()`.

## 11. `VendorProfileForm` — `src/components/forms/vendor-profile-form.tsx`

- Props unchanged (`defaultValues: VendorProfileInput`, `email`). Phone and Website inputs
  removed; `<ProductLinksFields …/>` after Contact Name (FR-015). The read-only Email stays as is.
- `src/app/vendor-dashboard/profile/page.tsx` passes
  `defaultValues={{ businessName, contactName, description: vendor.description ?? '',
  ...toProductLinkFields(vendor.product_links) }}`.
- A record migrated with no links renders Link 1 empty; the form's `isDirty` gate is unchanged, and
  saving with Link 1 blank shows `PRODUCT_LINK_REQUIRED_MESSAGE` on Link 1 (story 2 scenario 8).

## 12. `ProductLinksList` — `src/components/vendor/product-links-list.tsx` (new)

```ts
export function ProductLinksList({ links }: { links: readonly string[] }): ReactNode
```

Empty → `null` (the `InfoRow` then shows `—`). Otherwise an `<ol>` of `<li><a href={link}
target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-hover
break-all">{link}</a></li>` in stored order (FR-013). Used as the value of an `InfoRow
label="Product links"` on `src/app/dashboard/applications/[id]/page.tsx` (`VendorInfo`) and on
`src/app/vendor-dashboard/applications/[id]/page.tsx` (`BusinessInfo`), replacing the Website row;
the Phone row is removed from both. Both pages drop `ApplicationDetails` and the
`dynamicAnswers !== null` switch: `DynamicAnswers` always renders (its existing empty state when
there are no answers). `ApplicationDetails` also held the `Submitted` and `Last Updated` rows;
they are **kept** and move to the end of each page's event card (`EventInfo` after `Max Vendors`)
so the dates stay visible (FR-020 removes only the fixed-form fields).

## 13. `NoVendorProfile` — `src/components/vendor/no-vendor-profile.tsx` (new, async RSC)

```ts
export async function NoVendorProfile({ variant }: { variant: 'card' | 'inline' })
```

Reads `getUser()` from the server client. Renders the heading `No vendor profile linked` (the
`card` variant keeps the icon + `<h2>` block used by the dashboard home and the applications list;
`inline` keeps the `<p>` used by the application detail and profile pages) and then, verbatim
(FR-007):

> Your account isn't linked to a vendor yet. Applications are matched to the email address they
> were submitted with. You are signed in as **{email}**. [Submit an application](/apply) to
> create your vendor profile.

The four pages delete their inline copies and render it: `vendor-dashboard/page.tsx` and
`applications/page.tsx` → `variant="card"`; `applications/[id]/page.tsx` and `profile/page.tsx` →
`variant="inline"`. Link colour uses `text-primary` (the current `applications/page.tsx` copy's
`text-teal-400` is replaced, Principle III). No loader signature changes.

## 14. Unit tests (FR-024)

| File | Covers |
|---|---|
| `src/test/product-links.test.ts` (new) | normalize (`instagram.com/myshop` → `https://…`, `https://x` unchanged, `HTTP://` kept), `isWebAddress` (`not a link`, `mailto:`, `example`, 501 chars refused), schema (Link 1 required, Link 2 blank ok, field messages; a value over 500 **after** normalization → the too-long message on its field), compact (gap removed, order kept), `toProductLinkFields` |
| `src/test/dynamic-application-form.test.tsx` (updated) | no Phone/Website; heading + three link labels; Link 1 blank → message, nothing sent; `accountEmail` → value shown, `readOnly`, hint text, submit sends that address; `accountEmail={null}` → editable |
| `src/test/vendor-profile-form.test.tsx` (new) | renders slots from defaults; no Phone; Link 1 blank → refused with message; valid save → `updateVendorProfile` called with the trio and `toast.success('Profile updated')` |
| `src/test/answers-actions.test.ts` (updated) | payload carries `product_links` compacted, no `phone`/`website`/`legacy`/`attachments`; signed-in `getUser` → email overridden in payload and mail |
| `src/test/vendor-profile-action.test.ts` (new in US1, extended in US2) | US1: `updateVendorProfile` resolves through `resolveVendorId` (mock) — resolver `null` → `'No vendor profile linked to your account'`; happy path updates the row. US2: the update writes `product_links` compacted and no `phone`/`website`; validation failure returns the field message |
| `src/test/vendor-dashboard-actions.test.ts` (new, US1) | `getVendorProfile`: no user → `not_authenticated`; resolver `null` → `no_vendor_profile`; happy path returns the row (constitution II for the modified loaders; the other three loaders share the same resolver path) |
| `src/test/applications-readers.test.ts` (new, US2) | `getApplicationById`: `requireRole` failure → error; happy path maps `vendor.product_links` and no `phone`/`website`/fixed-form fields onto `ApplicationDetail` |
| `src/test/resolve-vendor-id.test.ts` (new) | see `link-vendor-account.md` |
| `src/test/product-links-list.test.tsx` (new) | hrefs in order, `target="_blank"`, `rel`, empty → nothing |
| `src/test/no-vendor-profile.test.tsx` (new) | the sentence with the address; `/apply` link |
| `src/test/export.test.ts` (new) | header row equals `EXPORT_HEADERS`; a row with two links → `Link 3` blank; empty-result branch uses the same headers |
| `src/test/apply-no-questionnaire.test.tsx` (rewrite of `apply-legacy-event.test.tsx`) | no questionnaire → the not-accepting message, no form; with questionnaire → the form, `accountEmail` passed from `getUser` |
| removed | `application-form.test.tsx`, `application-detail-legacy.test.tsx`, the `submitApplication` describe in `applications-email-warning.test.ts`, the `applicationFormSchema` cases in `application-validation.test.ts` |
