# Evidence Management Platform - Frontend

A modern, responsive web application built with Next.js for managing digital and physical evidence in law enforcement and investigative environments.

![Frontend Screenshot](https://github.com/user-attachments/assets/62f9bebe-3a57-4186-80f0-71dd76149d60)

## 🎯 Features

### ✅ Complete Frontend Implementation
- **Modern React/Next.js 15** with App Router and TypeScript
- **Responsive Design** with Tailwind CSS
- **Professional UI Components** with consistent styling
- **Real-time Updates** via WebSocket integration
- **Secure Authentication** with JWT token management
- **Role-based Access Control** for different user types

### 🔐 Authentication System
- Secure login/logout functionality
- JWT token management with automatic refresh
- Protected routes and middleware
- Role-based access control
- Session management with localStorage

### 📱 User Interface
- **Dashboard**: Live statistics and recent activity overview
- **Cases Management**: Search, filter, and manage investigation cases
- **Evidence Management**: Handle digital/physical evidence with file uploads
- **User Administration**: Manage platform users and roles
- **Settings**: User preferences and system configuration

### 🎨 UI Components
- Reusable component library (Button, Input, Card, etc.)
- Loading states and error handling
- Professional color schemes and typography
- Mobile-responsive design
- Accessibility features

## 🏗 Architecture

### Technology Stack
- **Framework**: Next.js 15.5 with App Router
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 4.x
- **Forms**: React Hook Form with Zod validation
- **HTTP Client**: Axios with interceptors
- **Real-time**: Socket.io Client
- **State Management**: React Context + Hooks
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

### Project Structure
```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── dashboard/         # Dashboard page
│   │   ├── cases/             # Cases management
│   │   ├── evidence/          # Evidence management
│   │   ├── users/             # User administration
│   │   ├── login/             # Authentication
│   │   └── settings/          # User settings
│   ├── components/            # Reusable UI components
│   │   ├── ui/                # Base UI components
│   │   ├── forms/             # Form components
│   │   └── layout/            # Layout components
│   ├── services/              # API service layer
│   │   ├── api.ts             # Base HTTP client
│   │   ├── auth.ts            # Authentication service
│   │   ├── cases.ts           # Cases API
│   │   ├── evidence.ts        # Evidence API
│   │   ├── users.ts           # Users API
│   │   └── websocket.ts       # WebSocket service
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.tsx        # Authentication hook
│   │   └── useWebSocket.ts    # WebSocket hook
│   ├── types/                 # TypeScript type definitions
│   └── lib/                   # Utility functions
└── public/                    # Static assets
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ 
- npm 9+
- Evidence Management Platform Backend (running on localhost:3000)

### Installation

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Edit configuration
   NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
   NEXT_PUBLIC_WEBSOCKET_URL=http://localhost:3000
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Open Browser**
   Navigate to `http://localhost:3001`

### Production Build
```bash
npm run build
npm start
```

## 🎮 Usage

### Authentication
1. Start the application and navigate to the login page
2. Enter your credentials (configured in the backend)
3. Upon successful login, you'll be redirected to the dashboard

### Dashboard
- View system statistics and recent activity
- Monitor real-time updates via WebSocket
- Quick access to all major features

### Cases Management
- Create, view, and manage investigation cases
- Search and filter by status, priority, or assigned user
- Track case progress and evidence associations

### Evidence Management  
- Upload and manage digital evidence files
- View file metadata and processing status
- Track chain of custody with digital signatures
- Support for multiple file types (photos, videos, documents)

### User Administration
- Manage platform users and their roles
- View user activity and status
- Configure permissions and access levels

## 🔧 API Integration

### Backend Connection
The frontend connects to the Evidence Management Platform backend via:
- **REST API**: Standard CRUD operations
- **WebSocket**: Real-time updates and notifications
- **File Upload**: Multipart form data for evidence files

### Error Handling
- Automatic token refresh on 401 errors
- Graceful fallback when backend is unavailable
- User-friendly error messages and loading states

### Real-time Features
- Live dashboard statistics
- Case and evidence update notifications
- File processing progress updates
- User activity monitoring

## 🔒 Security

### Authentication Security
- JWT tokens stored securely in localStorage
- Automatic token refresh mechanism
- Secure logout with token invalidation
- Protected routes requiring authentication

### API Security
- All API requests include authorization headers
- Request interceptors for token management
- Response interceptors for error handling
- CORS configuration for cross-origin requests

## 🎨 Customization

### Styling
- Tailwind CSS for utility-first styling
- Custom color scheme in `globals.css`
- Responsive design breakpoints
- Dark mode support (configurable)

### Components
- Reusable UI components in `components/ui/`
- Form components with validation
- Layout components for consistent design
- Loading and error state components

### Configuration
- Environment variables for API endpoints
- Configurable application settings
- User preferences and customization

## 📱 Responsive Design

The application is fully responsive and works on:
- **Desktop**: Full-featured interface with sidebar navigation
- **Tablet**: Collapsible navigation and optimized layouts
- **Mobile**: Touch-friendly interface with mobile navigation

## 🚀 Deployment

### Environment Variables
```bash
# Production API URL
NEXT_PUBLIC_API_URL=https://api.yourplatform.com/api/v1
NEXT_PUBLIC_WEBSOCKET_URL=https://ws.yourplatform.com

# Application Configuration
NEXT_PUBLIC_APP_NAME=Evidence Management Platform
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Build Commands
```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Linting
npm run lint
```

### Deployment Options
- **Vercel**: Native Next.js deployment
- **Netlify**: Static site hosting
- **Docker**: Containerized deployment
- **Traditional Hosting**: Build and serve static files

## 🛠 Development

### Code Quality
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Consistent component patterns

### Testing (Future Enhancement)
- Unit tests with Jest
- Component tests with React Testing Library
- End-to-end tests with Playwright
- Integration tests for API calls

### Performance
- Next.js optimization features
- Image optimization
- Code splitting
- Lazy loading components

## 📋 TODO / Future Enhancements

- [ ] File upload with drag-and-drop interface
- [ ] Advanced search with filters and facets
- [ ] Bulk operations for cases and evidence
- [ ] Export functionality (PDF, CSV)
- [ ] Advanced user role management
- [ ] Mobile app companion
- [ ] Offline support with service workers
- [ ] Advanced analytics and reporting
- [ ] Multi-language support (i18n)
- [ ] Theme customization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation in the backend repository

---

**Built with ❤️ using Next.js and TypeScript**
