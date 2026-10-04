'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, MapPin, Calendar, Wallet, ArrowRight, Users } from 'lucide-react'
import { useApp } from '@/components/providers/AppProvider'
import { TripCard } from '@/components/trips/TripCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { PageSkeleton } from '@/components/ui/Skeleton'
import { compareDateKeys, formatCurrency, formatSignedCurrency, getTripStatus, todayKey, pluralize } from '@/lib/utils'
import { getOverallNetForMe, getTripExpenses, getTripFinancials, getTripSpent, ME_ID } from '@/lib/selectors'

export default function Dashboard() {
  const app = useApp()
  const { hydrated, trips, expenses, friends, settlements } = app
  const [today] = useState(() => todayKey())

  const me = friends.find((f) => f.id === ME_ID)

  const sortedTrips = useMemo(
    () =>
      [...trips].sort((a, b) => {
        // Ongoing first, then upcoming soonest-first, then past most-recent-first.
        const rank = { ongoing: 0, upcoming: 1, past: 2 }
        const sa = getTripStatus(a.startDate, a.endDate, today)
        const sb = getTripStatus(b.startDate, b.endDate, today)
        if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb]
        return sa === 'past' ? compareDateKeys(b.endDate, a.endDate) : compareDateKeys(a.startDate, b.startDate)
      }),
    [trips, today],
  )

  const upcoming = sortedTrips.filter((t) => getTripStatus(t.startDate, t.endDate, today) !== 'past')
  const nextTrip = upcoming[0]
  const outstanding = useMemo(() => getOverallNetForMe({ trips, expenses, friends, settlements }), [trips, expenses, friends, settlements])

  // Trips where I personally still owe or am owed something.
  const unsettledTrips = useMemo(
    () =>
      trips
        .map((trip) => {
          const fin = getTripFinancials({ trips, expenses, friends, settlements }, trip)
          const mine = fin.transfers.filter((t) => t.from === ME_ID || t.to === ME_ID)
          return { trip, transfers: mine }
        })
        .filter((x) => x.transfers.length > 0),
    [trips, expenses, friends, settlements],
  )

  if (!hydrated) return <PageSkeleton />

  const nameOf = (id: string) => friends.find((f) => f.id === id)?.name ?? 'someone'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      {/* Hero */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-gray-900 mb-2">
            Welcome back{me && me.name !== 'You' ? `, ${me.name.split(' ')[0]}` : ''} ✈️
          </h1>
          <p className="text-gray-500">
            {upcoming.length === 0
              ? 'No trips on the horizon. Time to plan one?'
              : nextTrip && getTripStatus(nextTrip.startDate, nextTrip.endDate, today) === 'ongoing'
                ? `You're in ${nextTrip.destination} right now. Enjoy!`
                : `You have ${pluralize(upcoming.length, 'upcoming trip')} planned.`}
          </p>
        </div>
        <Link href="/trips/new">
          <Button icon={<Plus className="w-4 h-4" aria-hidden="true" />}>Plan a trip</Button>
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <Card className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#E8F0EA] flex items-center justify-center text-[#5A7A60] shrink-0">
            <MapPin className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total trips</p>
            <p className="text-2xl font-semibold text-gray-900">{trips.length}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#F5F0E8] flex items-center justify-center text-[#a8946a] shrink-0">
            <Calendar className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Upcoming</p>
            <p className="text-2xl font-semibold text-gray-900">{upcoming.length}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#E0F0EF] flex items-center justify-center text-[#6BA3A0] shrink-0">
            <Wallet className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{outstanding > 0.004 ? "You're owed" : outstanding < -0.004 ? 'You owe' : 'Balance'}</p>
            <p className={`text-2xl font-semibold ${outstanding > 0.004 ? 'text-[#6BA3A0]' : outstanding < -0.004 ? 'text-[#C47C7C]' : 'text-gray-900'}`}>
              {Math.abs(outstanding) < 0.005 ? 'Settled up' : formatSignedCurrency(outstanding)}
            </p>
          </div>
        </Card>
      </div>

      {/* Settle-up nudges */}
      {unsettledTrips.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Settle up</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unsettledTrips.slice(0, 4).map(({ trip, transfers }) => (
              <Card key={trip.id} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-gray-900 truncate">{trip.name}</p>
                  <Link href={`/trips/${trip.id}`} className="text-sm text-[#7C9A82] hover:underline inline-flex items-center shrink-0">
                    Settle <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {transfers.map((t) => {
                    const other = friends.find((f) => f.id === (t.from === ME_ID ? t.to : t.from))
                    return (
                      <li key={`${t.from}-${t.to}`} className="flex items-center gap-2 text-sm">
                        {other && <Avatar name={other.name} color={other.color} size="xs" />}
                        <span className="text-gray-600 truncate">
                          {t.from === ME_ID ? `You pay ${nameOf(t.to)}` : `${nameOf(t.from)} pays you`}
                        </span>
                        <span className={`ml-auto font-medium tabular-nums ${t.from === ME_ID ? 'text-[#C47C7C]' : 'text-teal-600'}`}>
                          {formatCurrency(t.amount)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Trips */}
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Your trips</h2>
        <Link href="/trips" className="text-sm text-[#7C9A82] hover:underline">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedTrips.slice(0, 5).map((trip) => (
          <TripCard key={trip.id} trip={trip} friends={friends} spent={getTripSpent(getTripExpenses(expenses, trip.id))} today={today} />
        ))}

        <Link href="/trips/new" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82] rounded-2xl">
          <div className="h-full min-h-[280px] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 flex flex-col items-center justify-center text-gray-500 hover:text-[#7C9A82] hover:border-[#7C9A82] hover:bg-[#E8F0EA]/30 transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
              <Plus className="w-6 h-6" aria-hidden="true" />
            </div>
            <span className="font-medium">Plan a new trip</span>
          </div>
        </Link>
      </div>

      {friends.length <= 1 && (
        <Card className="mt-12 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#E8F0EA] flex items-center justify-center text-[#5A7A60] shrink-0">
            <Users className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Travelling with others?</p>
            <p className="text-sm text-gray-500">Add your friends so you can split expenses with them.</p>
          </div>
          <Link href="/friends">
            <Button variant="outline">Add friends</Button>
          </Link>
        </Card>
      )}
    </div>
  )
}
