'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plane, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/components/providers/AppProvider'
import { Avatar } from '@/components/ui/Avatar'
import { ME_ID } from '@/lib/selectors'

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'Trips', href: '/trips' },
  { name: 'Friends', href: '/friends' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { friends, hydrated } = useApp()
  const me = hydrated ? friends.find((f) => f.id === ME_ID) : undefined

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const avatar = me ? (
    <Avatar name={me.name} color={me.color} size="sm" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-[#E8F0EA] flex items-center justify-center text-[#5A7A60] font-medium text-xs" aria-hidden="true">
      ME
    </div>
  )

  return (
    <nav className="fixed top-0 w-full bg-white border-b border-gray-100 z-40 h-16" aria-label="Main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          <Link href="/" className="flex items-center gap-2">
            <Plane className="w-6 h-6 text-[#7C9A82]" aria-hidden="true" />
            <span className="text-xl font-serif tracking-wide font-semibold text-gray-900">Travellé</span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'text-[#7C9A82] border-b-2 border-[#7C9A82] pb-1'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {link.name}
              </Link>
            ))}
            <Link href="/friends" className="ml-4 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82]" aria-label="Your profile">
              {avatar}
            </Link>
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-500 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82] rounded-md p-1"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div id="mobile-nav" className="md:hidden bg-white border-b border-gray-100 shadow-sm">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  isActive(link.href)
                    ? 'text-[#7C9A82] bg-[#E8F0EA]'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {link.name}
              </Link>
            ))}
            <Link href="/friends" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-2 flex items-center gap-3">
              {avatar}
              <span className="text-sm font-medium text-gray-700">{me?.name ?? 'My profile'}</span>
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
