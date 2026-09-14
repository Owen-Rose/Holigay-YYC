import Link from 'next/link';
import { getVendorProfile } from '@/lib/actions/vendor-dashboard';
import { VendorProfileForm } from '@/components/forms/vendor-profile-form';

// This page uses cookies (via Supabase auth) so it cannot be statically rendered
export const dynamic = 'force-dynamic';

// =============================================================================
// Error States
// =============================================================================

function NoVendorProfile() {
  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-12 text-center">
      <p className="text-foreground text-sm font-medium">No vendor profile linked</p>
      <p className="text-muted mt-2 text-sm">
        Your account isn&apos;t linked to a vendor yet.{' '}
        <Link href="/apply" className="text-teal-400 hover:text-teal-300">
          Submit an application
        </Link>{' '}
        to create your vendor profile.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-12 text-center">
      <p className="text-sm font-medium text-red-400">Something went wrong loading your profile.</p>
      <p className="mt-1 text-sm text-red-400/80">Please try again later.</p>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default async function VendorProfilePage() {
  const result = await getVendorProfile();

  if (!result.success) {
    if (result.error === 'no_vendor_profile') {
      return (
        <div>
          <div className="mb-6">
            <h1 className="text-foreground text-2xl font-bold">My Profile</h1>
            <p className="text-muted mt-1 text-sm">Manage your business information.</p>
          </div>
          <NoVendorProfile />
        </div>
      );
    }
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-foreground text-2xl font-bold">My Profile</h1>
        </div>
        <ErrorState />
      </div>
    );
  }

  const vendor = result.data;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">My Profile</h1>
        <p className="text-muted mt-1 text-sm">Manage your business information.</p>
      </div>

      {/* Profile Form */}
      <div className="border-border-subtle bg-surface rounded-lg border p-6">
        <VendorProfileForm
          email={vendor.email}
          defaultValues={{
            businessName: vendor.business_name,
            contactName: vendor.contact_name,
            phone: vendor.phone ?? '',
            website: vendor.website ?? '',
            description: vendor.description ?? '',
          }}
        />
      </div>
    </div>
  );
}
