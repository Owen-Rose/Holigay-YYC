import Link from 'next/link';
import { getActiveEvents } from '@/lib/actions/applications';

export const metadata = {
  title: 'Holigay Vendor Market | Apply to Join Our Events',
  description:
    'Join the Holigay Vendor Market! Showcase your products at our vibrant marketplace events. Apply now to connect with customers and grow your business.',
};

export default async function LandingPage() {
  // Fetch active events to display on the landing page
  const events = await getActiveEvents();

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Showcase Your Products at
          <span className="block bg-gradient-to-r from-red-500 via-yellow-400 via-green-500 via-blue-500 to-primary bg-clip-text text-transparent">
            Holigay Vendor Market
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Connect with enthusiastic shoppers, grow your customer base, and be part of a vibrant
          community marketplace. We&apos;re looking for talented vendors like you!
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/apply"
            className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-violet-600 via-pink-500 to-orange-400 px-8 py-3 text-base font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
          >
            Apply Now
          </Link>
          <a
            href="#events"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-8 py-3 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-surface-bright"
          >
            View Events
          </a>
        </div>
      </section>

      {/* Benefits Section */}
      <section>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            Why Vendors Love Our Markets
          </h2>
          <p className="mt-2 text-muted">Join a supportive community and grow your business</p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Benefit 1: High Foot Traffic */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">High Foot Traffic</h3>
            <p className="mt-2 text-muted">
              Our events attract hundreds of eager shoppers looking for unique products and local
              finds.
            </p>
          </div>

          {/* Benefit 2: Community Support */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Supportive Community</h3>
            <p className="mt-2 text-muted">
              Join a welcoming network of vendors who collaborate, share tips, and support each
              other&apos;s success.
            </p>
          </div>

          {/* Benefit 3: Easy Setup */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/15 text-purple-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Hassle-Free Setup</h3>
            <p className="mt-2 text-muted">
              We provide tables, chairs, and support. Just bring your products and creativity!
            </p>
          </div>

          {/* Benefit 4: Marketing Support */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Marketing Exposure</h3>
            <p className="mt-2 text-muted">
              Get featured in our promotions, social media, and email campaigns to reach new
              customers.
            </p>
          </div>

          {/* Benefit 5: Affordable Rates */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-teal-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Affordable Booth Rates</h3>
            <p className="mt-2 text-muted">
              Competitive pricing designed with small businesses in mind. Great value for the
              exposure you&apos;ll receive.
            </p>
          </div>

          {/* Benefit 6: Prime Location */}
          <div className="rounded-lg border border-border-subtle bg-surface/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/15 text-pink-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Prime Locations</h3>
            <p className="mt-2 text-muted">
              Our venues are easily accessible with ample parking and high visibility in the
              community.
            </p>
          </div>
        </div>
      </section>

      {/* Upcoming Events Section */}
      <section id="events" className="scroll-mt-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Upcoming Events</h2>
          <p className="mt-2 text-muted">Apply now to secure your spot at our next market</p>
        </div>

        <div className="mt-10">
          {events.length > 0 ? (
            <div className="space-y-6">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-bright text-muted-foreground">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground">No Upcoming Events</h3>
              <p className="mt-2 text-muted">
                Check back soon! We&apos;re planning exciting new markets.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="rounded-xl bg-gradient-to-r from-violet-600 via-pink-500 to-orange-400 p-8 text-center text-white sm:p-12">
        <h2 className="text-2xl font-bold sm:text-3xl">Ready to Grow Your Business?</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/80">
          Join our community of successful vendors and connect with customers who appreciate
          quality, local products.
        </p>
        <Link
          href="/apply"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-8 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-white/90"
        >
          Start Your Application
        </Link>
      </section>
    </div>
  );
}

// Helper component for event cards
type Event = {
  id: string;
  name: string;
  event_date: string;
  location: string;
  description: string | null;
  application_deadline: string | null;
};

function EventCard({ event }: { event: Event }) {
  // Format the event date
  const eventDate = new Date(event.event_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format the application deadline if present
  const deadline = event.application_deadline
    ? new Date(event.application_deadline).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface sm:flex-row">
      {/* Date badge - visible on left for desktop, top for mobile */}
      <div className="flex shrink-0 flex-col items-center justify-center bg-primary p-4 text-primary-foreground sm:w-32">
        <span className="text-sm font-medium uppercase">
          {new Date(event.event_date).toLocaleDateString('en-US', {
            month: 'short',
          })}
        </span>
        <span className="text-3xl font-bold">{new Date(event.event_date).getDate()}</span>
        <span className="text-sm">{new Date(event.event_date).getFullYear()}</span>
      </div>

      {/* Event details */}
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{event.name}</h3>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {eventDate}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {event.location}
            </span>
          </div>
          {event.description && <p className="mt-3 text-muted">{event.description}</p>}
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          {deadline && (
            <span className="text-sm text-muted-foreground">
              Apply by <span className="font-medium text-foreground">{deadline}</span>
            </span>
          )}
          <Link
            href="/apply"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Apply for this Event
          </Link>
        </div>
      </div>
    </div>
  );
}
