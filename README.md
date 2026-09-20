# 🚀 RoadmapIQ - Server

Backend API for CareerPilot AI built with Express.js, TypeScript, MongoDB, Better Auth, and Groq AI.

---

Frontend: https: //careerpilot-client-kzhimel.vercel.app/  

Client repo: https: //github.com/Kz-Himel/careerpilot-client  

Backend API: https: //careerpilot-server-kzhimel.vercel.app/  

---

# ✨ Features

- REST API
- Better Auth Authentication
- JWT Verification
- Career Goal CRUD
- AI Roadmap Generation
- Save Roadmaps
- MongoDB Database
- Secure Middleware
- Error Handling

---

# 🛠 Tech Stack

- Node.js
- Express.js
- TypeScript
- MongoDB
- Better Auth
- JWT
- Groq API
- dotenv
- cors

---

# 📂 Folder Structure

```
src/
│
├── config
├── middleware
├── routes
├── types
├── utils
├── lib
└── index.ts
```

---

# ⚙️ Environment Variables

Create a `.env`

```env
PORT=

MONGODB_URI=

BETTER_AUTH_SECRET=

BETTER_AUTH_URL=

GROQ_API_KEY=
```

---

# 🚀 Installation

Clone Repository

```bash
git clone https://github.com/your-username/careerpilot-server.git
```

Go to Project

```bash
cd careerpilot-server
```

Install Packages

```bash
npm install
```

Run Development Server

```bash
npm run dev
```

Build

```bash
npm run build
```

Start

```bash
npm start
```

---

# 📡 API Endpoints

## Goals

```
POST    /goals

GET     /goals

GET     /goals/:id

PATCH   /goals/:id

DELETE  /goals/:id
```

---

## AI

```
POST

/roadmap/generate
```

---

## Saved Roadmaps

```
POST

/saved-roadmaps

GET

/saved-roadmaps

DELETE

/saved-roadmaps/:id
```

---

# 🗄 Database Collections

```
users

careerGoals

savedRoadmaps
```

---

# 🔒 Security

- Better Auth
- JWT Verification
- Protected Routes
- Environment Variables
- CORS
- Middleware Validation

---

# 🤖 AI Integration

Uses **Groq API** with:

- Llama 3.3 70B Versatile

Features:

- Personalized Career Roadmap
- Learning Plan
- Skill Recommendations
- Project Suggestions
- Interview Preparation

---

# 👨‍💻 Author

Khayruzzaman Himel

GitHub:
https://github.com/Kz-Himel

---

# ⭐ Star this repository if you like it.
