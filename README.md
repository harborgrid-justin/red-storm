# Evidence Management Platform - Backend

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)

## Overview

A comprehensive evidence management platform backend built with Node.js, TypeScript, and PostgreSQL. This system provides secure, scalable APIs for managing digital and physical evidence in law enforcement and investigative environments.

## 🚀 Features

### ✅ Phase 1: Backend Foundation (COMPLETED)

#### Core Architecture
- **Node.js 20+** with **TypeScript 5.x** for type safety and maintainability
- **Express.js 4.x** with **Helmet.js** for security headers and middleware
- **Prisma ORM** with **PostgreSQL 15+** for type-safe database operations
- **Microservices architecture** ready with service discovery placeholder
- **Redis/Bull** for background job processing and message queues
- **Winston logging** with structured JSON logs and correlation IDs

#### Security Implementation
- **JWT authentication** with refresh tokens and blacklist management
- **Passport.js** foundation for SAML/OAuth2/LDAP integration strategies
- **Rate limiting** with express-rate-limit and Redis store
- **Input validation** using Zod schemas with comprehensive sanitization
- **CSRF protection** capabilities with secure session management
- **Encryption utilities** using Node.js crypto module and bcrypt

#### Database Setup
- **PostgreSQL cluster** ready configuration with connection pooling
- **Database migrations** with Prisma Migrate and seeding scripts
- **Row-level security (RLS)** policies foundation for multi-tenant data isolation
- **Full-text search** ready with PostgreSQL trgm and GIN indexes support
- **Audit logging** with comprehensive chain of custody tracking

#### API Foundation
- **RESTful API** design with comprehensive endpoint structure
- **API versioning** strategy with header-based routing
- **GraphQL endpoint** using Apollo Server for complex queries
- **WebSocket integration** with Socket.IO for real-time notifications
- **Response compression** with gzip/brotli encoding
- **OpenAPI 3.0** specification ready

## 📦 Project Structure

```
src/
├── config/           # Configuration files
│   ├── index.ts     # Main configuration with environment validation
│   ├── database.ts  # Prisma client and database utilities
│   ├── logger.ts    # Winston logging configuration
│   └── redis.ts     # Redis client and queue setup
├── middleware/       # Express middleware
│   ├── auth.ts      # JWT authentication and authorization
│   ├── error.ts     # Global error handling
│   ├── security.ts  # Security headers, CORS, rate limiting
│   └── validation.ts # Zod schema validation
├── routes/          # API routes
│   ├── auth.ts      # Authentication endpoints
│   ├── cases.ts     # Case management endpoints
│   ├── evidence.ts  # Evidence management endpoints
│   ├── users.ts     # User management endpoints
│   ├── health.ts    # Health check endpoints
│   └── graphql.ts   # GraphQL endpoint
├── utils/           # Utility functions
│   ├── crypto.ts    # Cryptographic utilities
│   └── helpers.ts   # General helper functions
├── types/           # TypeScript type definitions
├── database/        # Database related files
│   └── seed.ts      # Database seeding script
└── app.ts           # Main Express application
```

## 🛠 Installation & Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- npm 9+

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd red-storm
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Redis configurations
   ```

4. **Database setup**
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run database migrations
   npm run db:migrate
   
   # Seed the database
   npm run db:seed
   ```

5. **Development with Docker**
   ```bash
   # Start PostgreSQL, Redis, and auxiliary services
   npm run docker:dev
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

## 📊 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user profile

### Users
- `GET /api/v1/users` - List users (admin)
- `GET /api/v1/users/:id` - Get user by ID
- `POST /api/v1/users` - Create user (admin)
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user (super admin)

### Cases
- `GET /api/v1/cases` - List cases with filtering
- `GET /api/v1/cases/:id` - Get case by ID
- `POST /api/v1/cases` - Create new case
- `PUT /api/v1/cases/:id` - Update case
- `DELETE /api/v1/cases/:id` - Archive case

### Evidence
- `GET /api/v1/evidence` - List evidence items with filtering
- `GET /api/v1/evidence/:id` - Get evidence item by ID
- `POST /api/v1/evidence` - Create evidence item
- `PUT /api/v1/evidence/:id` - Update evidence item
- `DELETE /api/v1/evidence/:id` - Delete evidence item

### GraphQL
- `POST /api/v1/graphql` - GraphQL endpoint
- `GET /api/v1/graphql` - GraphQL playground (dev only)

### Health
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health/live` - Liveness probe (Kubernetes)

## 🗄 Database Schema

### Core Entities
- **Users** - User accounts with role-based access control
- **Roles** - Permission-based roles (admin, investigator, analyst, viewer)
- **Cases** - Investigation cases with status tracking
- **Evidence Items** - Digital and physical evidence with chain of custody
- **Tags** - Flexible tagging system for cases and evidence
- **Audit Logs** - Comprehensive audit trail for all actions

### Security Features
- Row-level security (RLS) policies ready
- Encrypted sensitive data fields
- Comprehensive audit logging
- Chain of custody tracking

## 🔐 Security Features

- **JWT-based authentication** with refresh token rotation
- **Role-based access control** (RBAC) with granular permissions
- **Rate limiting** to prevent abuse
- **Input validation** with Zod schemas
- **SQL injection protection** via Prisma ORM
- **CORS protection** with configurable origins
- **Security headers** via Helmet.js
- **Session security** with Redis-backed sessions

## 📝 Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://evidence_user:evidence_pass@localhost:5432/evidence_platform

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secure-jwt-secret
JWT_REFRESH_SECRET=your-super-secure-refresh-secret

# Security
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📋 Scripts

```bash
# Development
npm run dev                 # Start development server with hot reload
npm run build              # Build TypeScript to JavaScript
npm run start              # Start production server

# Database
npm run db:generate        # Generate Prisma client
npm run db:push           # Push schema to database
npm run db:migrate        # Run database migrations
npm run db:seed           # Seed database with sample data
npm run db:studio         # Open Prisma Studio

# Testing
npm run test              # Run tests
npm run test:watch        # Run tests in watch mode

# Code Quality
npm run lint              # Run ESLint
npm run lint:fix          # Fix ESLint issues

# Docker
npm run docker:dev        # Start development services
npm run docker:down       # Stop development services
```

## 🔧 Development

### Default Users (after seeding)

1. **System Administrator**
   - Email: `admin@evidence-platform.local`
   - Password: `admin123!`
   - Role: `admin`

2. **Sample Investigator**
   - Email: `investigator@evidence-platform.local`
   - Password: `investigator123!`
   - Role: `investigator`

### Logging

The application uses structured logging with correlation IDs:
- **Development**: Pretty-printed console logs
- **Production**: JSON structured logs with daily rotation
- **Audit logs**: Separate audit trail for compliance

### Queue Processing

Background job processing using Bull/Redis:
- Email notifications
- File processing
- Audit log processing
- Report generation

## 🐳 Docker Support

The project includes Docker Compose for development:
- PostgreSQL with extensions
- Redis for caching and queues
- Consul for service discovery
- pgAdmin for database management
- Redis Commander for Redis management

## 🚧 Next Steps (Phase 2+)

- [ ] Complete microservices architecture
- [ ] File upload and processing system
- [ ] Advanced search and analytics
- [ ] SAML/OAuth2 integration
- [ ] API rate limiting enhancements
- [ ] TimescaleDB for time-series data
- [ ] Advanced audit and compliance features
- [ ] Mobile API optimizations

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

---

**Note**: This is Phase 1 of the Evidence Management Platform. The foundation is complete and ready for extension with additional features and microservices architecture.