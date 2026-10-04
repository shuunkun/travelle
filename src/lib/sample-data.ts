import { Trip, Expense, Friend, Settlement } from './types';

export const sampleFriends: Friend[] = [
  { id: 'me', name: 'You', email: 'you@example.com', color: '#7C9A82' },
  { id: 'sarah', name: 'Sarah Chen', email: 'sarah@example.com', color: '#D4C5A9' },
  { id: 'marco', name: 'Marco Rivera', email: 'marco@example.com', color: '#6BA3A0' },
];

export const sampleTrips: Trip[] = [
  {
    id: 'paris_2025',
    name: 'Paris Spring Break',
    destination: 'Paris, France',
    startDate: '2025-04-10',
    endDate: '2025-04-16',
    coverImage: 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)',
    description: 'A beautiful week in Paris exploring museums, cafes, and historical sights.',
    travelers: ['me', 'sarah', 'marco'],
    budget: 3500,
    checklist: [
      { id: 'c1', text: 'Passport', done: true },
      { id: 'c2', text: 'Museum tickets (printed)', done: false },
      { id: 'c3', text: 'EU power adapter', done: false },
    ],
    itinerary: [
      {
        date: '2025-04-10',
        activities: [
          { id: 'a1', time: '10:00', title: 'Arrival at CDG', location: 'Charles de Gaulle Airport', notes: 'Take RER B to city center', category: 'transport' },
          { id: 'a2', time: '14:00', title: 'Check-in to Airbnb', location: 'Le Marais', notes: 'Code: 1234', category: 'accommodation' },
          { id: 'a3', time: '19:30', title: 'Welcome Dinner', location: 'Le Comptoir du Relais', notes: 'Reservation under Marco', category: 'food' }
        ]
      },
      {
        date: '2025-04-11',
        activities: [
          { id: 'a4', time: '09:00', title: 'Louvre Museum', location: 'Louvre', notes: 'Tickets booked for 9am', category: 'activity' },
          { id: 'a5', time: '13:00', title: 'Lunch at Cafe Marly', location: 'Next to Louvre', notes: 'Views of the pyramid', category: 'food' }
        ]
      },
      {
        date: '2025-04-12',
        activities: [
          { id: 'a6', time: '10:00', title: 'Eiffel Tower', location: 'Champ de Mars', notes: 'Taking the stairs', category: 'activity' },
          { id: 'a7', time: '16:00', title: 'Seine River Cruise', location: 'Port de la Bourdonnais', notes: 'Sunset cruise', category: 'activity' }
        ]
      }
    ]
  },
  {
    id: 'tokyo_2024',
    name: 'Tokyo Adventure',
    destination: 'Tokyo, Japan',
    startDate: '2024-10-01',
    endDate: '2024-10-10',
    coverImage: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    description: 'Amazing food and culture trip across Tokyo neighborhoods.',
    travelers: ['me', 'sarah'],
    budget: 5000,
    checklist: [],
    itinerary: [
      {
        date: '2024-10-02',
        activities: [
          { id: 't1', time: '11:00', title: 'Tsukiji Outer Market', location: 'Tsukiji', notes: 'Lots of street food', category: 'food' },
          { id: 't2', time: '15:00', title: 'teamLab Planets', location: 'Toyosu', notes: 'Wear shorts', category: 'activity' }
        ]
      }
    ]
  },
  {
    id: 'bali_2025',
    name: 'Bali Retreat',
    destination: 'Bali, Indonesia',
    startDate: '2025-08-01',
    endDate: '2025-08-05',
    coverImage: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    description: 'Relaxing villa stay in Ubud.',
    travelers: ['me', 'marco'],
    budget: 2000,
    checklist: [],
    itinerary: [
      {
        date: '2025-08-01',
        activities: [
          { id: 'b1', time: '14:00', title: 'Villa Check-in', location: 'Ubud', notes: 'Private pool villa', category: 'accommodation' }
        ]
      }
    ]
  }
];

export const sampleExpenses: Expense[] = [
  {
    id: 'e1',
    tripId: 'paris_2025',
    description: 'Airbnb (6 nights)',
    amount: 1200,
    currency: 'USD',
    paidBy: 'sarah',
    date: '2025-02-15',
    category: 'accommodation',
    splitBetween: [
      { friendId: 'me', amount: 400 },
      { friendId: 'sarah', amount: 400 },
      { friendId: 'marco', amount: 400 }
    ]
  },
  {
    id: 'e2',
    tripId: 'paris_2025',
    description: 'Louvre Tickets',
    amount: 60,
    currency: 'USD',
    paidBy: 'me',
    date: '2025-03-01',
    category: 'activity',
    splitBetween: [
      { friendId: 'me', amount: 20 },
      { friendId: 'sarah', amount: 20 },
      { friendId: 'marco', amount: 20 }
    ]
  },
  {
    id: 'e3',
    tripId: 'paris_2025',
    description: 'Welcome Dinner',
    amount: 150,
    currency: 'USD',
    paidBy: 'marco',
    date: '2025-04-10',
    category: 'food',
    splitBetween: [
      { friendId: 'me', amount: 50 },
      { friendId: 'sarah', amount: 50 },
      { friendId: 'marco', amount: 50 }
    ]
  },
  {
    id: 'e4',
    tripId: 'tokyo_2024',
    description: 'Shinkansen Tickets',
    amount: 280,
    currency: 'USD',
    paidBy: 'me',
    date: '2024-09-15',
    category: 'transport',
    splitBetween: [
      { friendId: 'me', amount: 140 },
      { friendId: 'sarah', amount: 140 }
    ]
  },
  {
    id: 'e5',
    tripId: 'tokyo_2024',
    description: 'Omakase Sushi',
    amount: 300,
    currency: 'USD',
    paidBy: 'sarah',
    date: '2024-10-05',
    category: 'food',
    splitBetween: [
      { friendId: 'me', amount: 150 },
      { friendId: 'sarah', amount: 150 }
    ]
  },
  {
    id: 'e6',
    tripId: 'bali_2025',
    description: 'Flight Tickets',
    amount: 1600,
    currency: 'USD',
    paidBy: 'me',
    date: '2025-01-10',
    category: 'transport',
    splitBetween: [
      { friendId: 'me', amount: 800 },
      { friendId: 'marco', amount: 800 }
    ]
  },
  {
    id: 'e7',
    tripId: 'paris_2025',
    description: 'Taxi from airport',
    amount: 65,
    currency: 'USD',
    paidBy: 'sarah',
    date: '2025-04-10',
    category: 'transport',
    splitBetween: [
      { friendId: 'me', amount: 21.67 },
      { friendId: 'sarah', amount: 21.67 },
      { friendId: 'marco', amount: 21.66 }
    ]
  },
  {
    id: 'e8',
    tripId: 'bali_2025',
    description: 'Yoga retreat deposit',
    amount: 200,
    currency: 'USD',
    paidBy: 'marco',
    date: '2025-02-01',
    category: 'activity',
    splitBetween: [
      { friendId: 'me', amount: 100 },
      { friendId: 'marco', amount: 100 }
    ]
  }
];

export const sampleSettlements: Settlement[] = [
  {
    id: 's1',
    tripId: 'tokyo_2024',
    from: 'me',
    to: 'sarah',
    amount: 10,
    date: '2024-10-12',
    note: 'Paid back after the trip',
  },
];
