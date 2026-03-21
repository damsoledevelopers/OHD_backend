# OHD Backend API Server

Express.js backend server for Organization Health Diagnostic system.

## 📁 Project Structure

```
Backend/
├── config/              # Configuration files
│   └── database.js      # MongoDB connection
├── controllers/         # Request handlers
│   ├── authController.js
│   ├── companyController.js
│   ├── sectionController.js
│   ├── questionController.js
│   ├── responseController.js
│   ├── reportController.js
│   ├── mailController.js
│   └── exportController.js
├── middleware/          # Custom middleware
│   └── auth.js         # Authentication middleware
├── models/             # Mongoose models
│   ├── User.js
│   ├── Company.js
│   ├── Section.js
│   ├── Question.js
│   ├── EmployeeResponse.js
│   └── MailLog.js
├── routes/             # Express routes
│   ├── auth.js
│   ├── companies.js
│   ├── sections.js
│   ├── questions.js
│   ├── responses.js
│   ├── reports.js
│   ├── mail.js
│   └── export.js
├── scripts/            # Database scripts
│   ├── initDatabase.js
│   └── initDatabase.ts
├── services/            # Business logic services
│   └── mailService.js
├── utils/               # Utility functions
│   ├── jwt.js
│   ├── password.js
│   └── calculations.js
├── .env                 # Environment variables (not in git)
├── .gitignore
├── env.example          # Example environment file
├── package.json
├── server.js            # Express server entry point
└── README.md
```

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Environment Setup

1. Copy `env.example` to `.env`:
```bash
cp env.example .env
```

2. Update `.env` with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/ohd
JWT_SECRET=your-super-secret-jwt-key
PORT=5000
FRONTEND_URL=http://localhost:3001
```

### Running the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will run on `http://localhost:5000` (or the PORT specified in .env).

## 📡 API Endpoints

All endpoints are prefixed with `/api`:

### Authentication
- `POST /api/auth/signup` - Create super admin
- `POST /api/auth/login` - Login

### Companies
- `GET /api/companies` - Get all companies
- `POST /api/companies` - Create company
- `GET /api/companies/:id` - Get company by ID
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

### Sections
- `GET /api/sections` - Get all sections
- `POST /api/sections` - Create section

### Questions
- `GET /api/questions` - Get all questions (optional: ?sectionId=xxx)
- `POST /api/questions` - Create question

### Responses
- `POST /api/responses` - Submit employee response
- `GET /api/responses/companies/:companyId` - Get company responses

### Reports
- `GET /api/reports/companies/:companyId` - Get company report
- `GET /api/reports/sections/:sectionId` - Get section report (optional: ?companyId=xxx)
- `GET /api/reports/overall` - Get overall report (optional: ?companyId=xxx)

### Mail
- `POST /api/mail/bulk` - Send bulk emails (multipart/form-data)
- `GET /api/mail/logs` - Get mail logs (optional: ?companyId=xxx&status=xxx&page=1&limit=50)

### Export
- `GET /api/export/companies/:companyId/pdf` - Export PDF report
- `GET /api/export/companies/:companyId/excel` - Export Excel report

## 🔐 Authentication

Most endpoints require admin authentication. Include the JWT token in:
- Cookie: `token` (HTTP-only cookie set on login)
- Header: `Authorization: Bearer <token>`

## 🗄️ Database

Initialize the database with sections and questions:
```bash
npm run init-db
```

## 📝 Notes

- Server runs on port 5000 by default
- CORS is configured for frontend URL
- All admin routes require authentication
- File uploads use multer for multipart/form-data

