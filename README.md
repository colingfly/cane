# Cane — Document Intelligence for Teams

Multi-tenant document search and AI-powered Q&A for SMB clients.

## Architecture

```
cane/
├── backend/          FastAPI API server
│   ├── app.py        Main API (auth, search, upload, admin)
│   ├── config.py     All configuration
│   ├── database.py   SQLAlchemy setup (MySQL)
│   ├── db_models.py  Tenant, User, Workspace, Document, SearchLog
│   ├── auth.py       JWT auth + FastAPI dependencies
│   ├── seed.py       Initialize DB + create admin account
│   ├── ingestor.py   Extraction + indexing (tenant-scoped)
│   └── ...           Chunking, enrichment, quality, reranking
│
└── frontend/         React + Vite
    └── src/
        ├── pages/    Login, Search, Documents, Dashboard, Settings, Admin
        ├── api/      Fetch wrapper with JWT
        └── context/  Auth state management
```

## Setup

### 1. MySQL Database

```sql
CREATE DATABASE cane CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt

# Configure (edit config.py or set environment variables)
export CANE_DB_USER=root
export CANE_DB_PASSWORD=yourpassword
export CANE_DB_NAME=cane
export CANE_SECRET_KEY=your-random-secret-key

# Initialize database + create your admin account
python seed.py

# Run API server
python app.py
# → http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` requests to the backend at `:8000`.

## First Steps

1. Run `seed.py` to create your admin account and a first client tenant
2. Start the backend: `python app.py`
3. Start the frontend: `npm run dev`
4. Log in at `http://localhost:5173/login`
5. Upload documents, search, and explore

## Roles

| Role    | Can do                                    |
|---------|-------------------------------------------|
| admin   | See all tenants, onboard clients, everything |
| owner   | Manage team, workspaces, upload, search   |
| member  | Upload and search                          |

## Admin Dashboard

Log in with your admin account and go to `/admin` to see:
- All client tenants with usage stats
- **Zero-result queries** — searches that found nothing (consulting goldmine)
- **Top queries** — what each client searches for most
- User activity and document inventory

## Environment Variables

| Variable           | Default       | Description             |
|-------------------|---------------|-------------------------|
| CANE_BASE_DIR     | (see config)  | Root data directory     |
| CANE_DB_USER      | root          | MySQL user              |
| CANE_DB_PASSWORD  | (empty)       | MySQL password          |
| CANE_DB_HOST      | localhost     | MySQL host              |
| CANE_DB_PORT      | 3306          | MySQL port              |
| CANE_DB_NAME      | cane          | MySQL database name     |
| CANE_SECRET_KEY   | change-me...  | JWT signing key         |
