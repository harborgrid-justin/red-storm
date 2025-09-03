'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { 
  Plus, 
  Search, 
  Users as UsersIcon,
  Mail,
  Shield,
  Calendar,
  CheckCircle,
  XCircle,
  UserPlus
} from 'lucide-react'
import UserService from '@/services/users'
import { User } from '@/types'
import { formatDate } from '@/lib/utils'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await UserService.getUsers({
        limit: 50,
        search: searchTerm || undefined,
        isActive: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined
      })
      setUsers(response.items)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (roleName: string) => {
    const badges = {
      'super_admin': 'bg-red-100 text-red-800',
      'admin': 'bg-purple-100 text-purple-800',
      'investigator': 'bg-blue-100 text-blue-800',
      'analyst': 'bg-green-100 text-green-800',
      'viewer': 'bg-gray-100 text-gray-800',
    }
    return badges[roleName as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  const handleSearch = () => {
    loadUsers()
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
    setTimeout(loadUsers, 100)
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Users</h1>
            <p className="mt-2 text-gray-600">
              Manage platform users, roles, and permissions
            </p>
          </div>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Search & Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilter(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Users</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <Button onClick={handleSearch}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading users..." />
          </div>
        ) : (
          <div className="space-y-4">
            {users.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UsersIcon className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
                  <p className="text-gray-600 text-center mb-6">
                    {searchTerm || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Get started by adding your first user'
                    }
                  </p>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add User
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {users.map((user) => (
                  <Card key={user.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white font-semibold text-lg">
                                {(user.firstName?.[0] || '') + (user.lastName?.[0] || '')}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {user.firstName} {user.lastName}
                              </h3>
                              {user.isActive ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </div>
                            
                            <div className="flex items-center text-gray-600 mb-2">
                              <Mail className="mr-1 h-4 w-4" />
                              <span className="text-sm">{user.email}</span>
                            </div>
                            
                            {user.username && (
                              <p className="text-sm text-gray-500 mb-3">
                                @{user.username}
                              </p>
                            )}
                            
                            <div className="flex flex-wrap gap-2 mb-3">
                              {user.roles.map((role) => (
                                <span
                                  key={role.id}
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(role.name)}`}
                                >
                                  <Shield className="mr-1 h-3 w-3" />
                                  {role.name.replace('_', ' ').toUpperCase()}
                                </span>
                              ))}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                              <div className="flex items-center">
                                <Calendar className="mr-1 h-4 w-4" />
                                <span>Joined {formatDate(user.createdAt)}</span>
                              </div>
                              {user.lastLogin && (
                                <div className="flex items-center">
                                  <span>Last login {formatDate(user.lastLogin)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-start space-x-2">
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                          <Button 
                            variant={user.isActive ? "destructive" : "default"} 
                            size="sm"
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Users Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
              <p className="text-xs text-muted-foreground">
                All registered users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.isActive).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrators</CardTitle>
              <Shield className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.roles.some(r => r.name.includes('admin'))).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Admin users
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}