'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { 
  SideNav, 
  SideNavItems, 
  SideNavLink, 
  Header, 
  HeaderName, 
  HeaderGlobalBar, 
  HeaderGlobalAction,
  Search,
  Content
} from '@carbon/react'
import {
  Dashboard,
  FolderOpen,
  Document,
  UserMultiple,
  Settings,
  Logout,
  Search as SearchIcon,
  Notification,
  User,
  Security,
  Analytics,
  DocumentExport
} from '@carbon/icons-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Dashboard },
  { name: 'Cases', href: '/cases', icon: FolderOpen },
  { name: 'Evidence', href: '/evidence', icon: Document },
  { name: 'Analytics', href: '/analytics', icon: Analytics, permission: 'analytics:read' },
  { name: 'Reports', href: '/reports', icon: DocumentExport, permission: 'reports:read' },
  { name: 'Users', href: '/users', icon: UserMultiple, permission: 'users:read' },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout, loading, hasPermission } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center cds--body cds--white">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  if (!user) {
    return <div className="cds--body cds--white">{children}</div>
  }

  return (
    <div className="cds--body cds--white">
      <Header aria-label="Evidence Management Platform">
        <HeaderName href="/dashboard" prefix="">
          <Security className="mr-2" />
          Evidence Platform
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction 
            aria-label="Search" 
            onClick={() => {}}
          >
            <SearchIcon />
          </HeaderGlobalAction>
          <HeaderGlobalAction 
            aria-label="Notifications" 
            onClick={() => {}}
          >
            <Notification />
          </HeaderGlobalAction>
          <HeaderGlobalAction 
            aria-label="User Profile" 
            onClick={() => logout()}
          >
            <Logout />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <SideNav 
        isFixedNav 
        expanded={true}
        isChildOfHeader={true}
        aria-label="Side navigation"
      >
        <SideNavItems>
          {navigation.map((item) => {
            // Check permissions if required
            if (item.permission && !hasPermission(item.permission)) {
              return null
            }

            const isActive = pathname === item.href
            return (
              <SideNavLink
                key={item.name}
                href={item.href}
                isActive={isActive}
                renderIcon={item.icon}
              >
                {item.name}
              </SideNavLink>
            )
          })}
        </SideNavItems>
      </SideNav>

      <Content>
        <div className="p-6">
          {children}
        </div>
      </Content>
    </div>
  )
}