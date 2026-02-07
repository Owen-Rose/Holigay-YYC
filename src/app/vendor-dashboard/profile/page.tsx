import Link from 'next/link'
import { getVendorProfile } from '@/lib/actions/vendors'
import { VendorProfileForm } from '@/components/forms/vendor-profile-form'

// =============================================================================
// Error States
// =============================================================================

function NoVendorProfile() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
      <p className="text-sm font-medium text-gray-900">No vendor profile linked</p>
      <p className="mt-2 text-sm text-gray-500">
        Your account isn&apos;t linked to a vendor yet.{' '}
        <Link href="/apply" className="text-teal-600 hover:text-teal-500">
          Submit an application
        </Link>{' '}
        to create your vendor profile.
      </p>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center">
      <p className="text-sm font-medium text-red-800">
        Something went wrong loading your profile.
      </p>
      <p className="mt-1 text-sm text-red-600">Please try again later.</p>
    </div>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export default async function VendorProfilePage() {
  const result = await getVendorProfile()

  if (!result.success) {
    if (result.error === 'no_vendor_profile') {
      return (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <p className="mt-1 text-sm text-gray-600">Manage your business information.</p>
          </div>
          <NoVendorProfile />
        </div>
      )
    }
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        </div>
        <ErrorState />
      </div>
    )
  }

  const vendor = result.data

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-600">Manage your business information.</p>
      </div>

      {/* Profile Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
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
  )
}
