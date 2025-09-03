import NextAuth, { NextAuthConfig } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { AuthService } from "@/services/auth"

export const authConfig: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null
          }

          const user = await AuthService.login({
            email: credentials.email as string,
            password: credentials.password as string,
          })

          if (user) {
            return {
              id: user.user.id,
              email: user.user.email,
              name: `${user.user.firstName} ${user.user.lastName}`,
              role: user.user.role,
            }
          }
          return null
        } catch (error) {
          console.error("Authentication error:", error)
          return null
        }
      },
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub
        session.user.role = token.role as string
      }
      return session
    },
  },
  trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)