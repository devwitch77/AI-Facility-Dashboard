# Smart Facility Monitoring & AI Insights Platform

This project is a full-stack system for real-time facility monitoring, anomaly detection, and automated reporting.  
It includes:

- React dashboard (Vite)
- Node.js backend (Express + PostgreSQL)
- Python AI microservice (FastAPI + Isolation Forest)
- Real-time sensor charts
- AI-generated summaries, insights, and anomaly scoring
- Report exports (CSV + PDF)
- Railway deployment (multi-service)

---

## Live Deployment

https://ai-facility-dashboard-production.up.railway.app/

---

## What This Project Does

- Streams and visualizes sensor data in real time  
- Computes facility stability and alerts  
- Uses Isolation Forest ML models for anomaly detection  
- Generates summaries and insights through the AI service  
- Provides exportable reporting (CSV / PDF)  
- Includes user authentication (login)  
- Fully deployed using Railway’s multi-service architecture

---

## Folder Structure

root/
│
├── dashboard/
│ └── client/ # React frontend
│
├── server/ # Node backend
│ ├── server.js
│ ├── auth.js
│ ├── reportRoutes.js
│ └── …
│
└── server/pyai/ # Python AI microservice
├── app.py
├── requirements.txt
└── iso_models.joblib


---

## Technologies Used

### Frontend
- React  
- Vite  
- TailwindCSS  
- Chart.js  
- Socket.IO client  

### Backend
- Node.js  
- Express  
- PostgreSQL (pg)  
- JWT authentication  
- PDFKit (for PDF export)  

### AI Microservice
- FastAPI  
- scikit-learn (IsolationForest)  
- joblib  
- numpy  

---

## Running the Project Locally

### 1. Clone the repository

### 2. Run the AI Service (Python)

cd server/pyai
pip install -r requirements.txt
uvicorn app:app --reload --port 8000

### 3. Run the Node Backend

Create `server/.env`:

DB_USER=youruser
DB_PASS=yourpass
DB_HOST=localhost
DB_NAME=yourdbname
DB_PORT=5432
JWT_SECRET=your-secret
PYAI_URL=http://localhost:8000

Then:

cd server
npm install
npm run dev

Backend runs at:

http://localhost:5000

### 4. Run the React Frontend

Create `dashboard/client/.env`:

VITE_API_BASE=http://localhost:5000

Then:

cd dashboard/client
npm install
npm run dev

Runs at:

http://localhost:5173

## Deployment Notes (Railway)

You need two Railway services:

1. server (Node backend + compiled frontend)
2. pyai (Python FastAPI microservice)

### Server environment variables:

DB_USER=
DB_PASS=
DB_HOST=
DB_NAME=
DB_PORT=
JWT_SECRET=
PYAI_URL=

### Client build variables:

VITE_API_BASE=





## Author

Built by Youssef Abouattalla.  
Full-stack development, deployment, and ML pipeline.
