'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Security } from '@carbon/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Checkbox, Link } from '@carbon/react'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const { login } = useAuth()
  const router = useRouter()
  
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      await login(data.email, data.password)
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (error) {
      console.error('Login error:', error)
      toast.error('Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="cds--body cds--white min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--cds-background)' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Security size={48} className="text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight" style={{ color: 'var(--cds-text-primary)' }}>
            Evidence Management Platform
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
            Sign in to your account
          </p>
        </div>
        
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div>
                <Input
                  {...form.register('email')}
                  id="email"
                  labelText="Email address"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  invalid={!!form.formState.errors.email}
                  invalidText={form.formState.errors.email?.message}
                />
              </div>

              <div>
                <Input
                  {...form.register('password')}
                  id="password"
                  labelText="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  invalid={!!form.formState.errors.password}
                  invalidText={form.formState.errors.password?.message}
                />
              </div>

              <div className="flex items-center justify-between">
                <Checkbox
                  id="remember-me"
                  labelText="Remember me"
                  checked={rememberMe}
                  onChange={(_, { checked }) => setRememberMe(checked)}
                />

                <Link href="#" className="text-sm">
                  Forgot your password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" text="Signing in..." />
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}