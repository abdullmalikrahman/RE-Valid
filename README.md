# RE-Valid — WebGIS Monitoring Platform

Stack: Next.js · FastAPI · PostgreSQL + PostGIS + TimescaleDB · Redis + Celery · MQTT · Leaflet

## Project Structure

```
RE-Valid/
├── frontend/          # Next.js (TypeScript + Tailwind)
├── backend/           # FastAPI (Python)
│   ├── app/
│   │   ├── api/v1/    # REST endpoints
│   │   ├── core/      # config, database
│   │   ├── models/    # SQLAlchemy models
│   │   ├── mqtt/      # IoT MQTT client
│   │   └── workers/   # Celery tasks
│   ├── db/init/       # SQL init scripts (PostGIS + TimescaleDB)
│   ├── main.py
│   └── requirements.txt
├── mqtt/config/       # Mosquitto config
├── docker-compose.yml # DB + Redis + MQTT broker
└── .env.example
```

## Quick Start

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required for database services
- Node.js 18+ (already installed)
- Python 3.11+ (already installed)

### 2. Start Services (Docker)
```bash
docker compose up -d
```
Services started:
- PostgreSQL + PostGIS + TimescaleDB → `localhost:5432`
- Redis → `localhost:6379`
- MQTT Broker (Mosquitto) → `localhost:1883`

### 3. Start Backend (FastAPI)
```bash
cd backend
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### 4. Start Frontend (Next.js)
```bash
cd frontend
npm run dev
```
App: http://localhost:3000

### 5. Start Celery Worker
```bash
cd backend
.venv\Scripts\activate
celery -A app.workers.celery_app worker --loglevel=info
```

## Environment Variables
Copy `.env.example` to `backend/.env` and adjust values.
