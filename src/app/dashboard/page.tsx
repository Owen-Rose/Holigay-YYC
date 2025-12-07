export default function DashboardPage() {
  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome to your event organizer dashboard.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Events" value="0" />
        <StatCard title="Pending Applications" value="0" />
        <StatCard title="Approved Vendors" value="0" />
        <StatCard title="Total Revenue" value="$0" />
      </div>

      {/* Placeholder Content */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900">Getting Started</h2>
        <p className="mt-2 text-sm text-gray-600">
          Create your first event to start accepting vendor applications.
        </p>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
