# VulnixAI - AI-Powered Code Security Scanner

A modern web application for scanning and analyzing code vulnerabilities with GitHub OAuth authentication.

## Features

- 🔐 GitHub OAuth Authentication
- 🔍 Code vulnerability scanning
- 📊 Real-time monitoring dashboard
- 🎨 Modern UI with dark theme
- 🚀 Separate frontend and backend architecture
- 🔒 JWT-based authentication

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A GitHub account

### Setup Instructions

For detailed setup instructions including GitHub OAuth configuration, see [SETUP.md](./SETUP.md)

#### Quick Setup

1. Clone the repository:
```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

2. Install frontend dependencies:
```sh
npm install
```

3. Install backend dependencies:
```sh
cd backend
npm install
cd ..
```

4. Configure GitHub OAuth (see [SETUP.md](./SETUP.md) for detailed steps)

5. Create environment files:
```sh
# Frontend
cp .env.example .env

# Backend
cp backend/.env.example backend/.env
```

6. Update environment variables with your GitHub OAuth credentials

7. Start both servers:

**Terminal 1 - Backend:**
```sh
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```sh
npm run dev
```

8. Open your browser and navigate to `http://localhost:5173`

## Project Structure

```
.
├── backend/                 # Backend server (Express + TypeScript)
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   └── types/          # TypeScript types
│   └── package.json
├── src/                    # Frontend application (React + TypeScript)
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── pages/              # Page components
│   ├── services/           # API services
│   └── config/             # Frontend configuration
├── SETUP.md               # Detailed setup guide
└── package.json
```

## Technologies

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- React Router
- Framer Motion

### Backend
- Express.js
- TypeScript
- JWT authentication
- GitHub OAuth
- CORS enabled

## Development

### Frontend Development
```sh
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run test         # Run tests
```

### Backend Development
```sh
cd backend
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm start            # Start production server
```

## API Endpoints

### Authentication
- `GET /api/auth/github` - Initiate GitHub OAuth flow
- `GET /api/auth/github/callback` - GitHub OAuth callback
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - Logout user

### Health Check
- `GET /health` - Server health check

## Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=VulnixAI
```

### Backend (backend/.env)
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

## Deployment

See [SETUP.md](./SETUP.md) for production deployment guidelines.

## Security

- JWT tokens for authentication
- CORS protection
- Environment-based configuration
- Secure OAuth flow with state parameter
- HTTPS recommended for production

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions, please open an issue in the repository.
