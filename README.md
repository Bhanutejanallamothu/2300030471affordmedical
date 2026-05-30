# Afford Notification Assignment

This repository is organized exactly as requested:

- `frontend/` contains the React + MUI application that runs on port `3000`
- `backend/` contains the Express API, priority-inbox script, SSE stream, and MySQL-ready read-state integration
- `notification_system_design.md` covers Stages 1 through 6
- `schema.sql` contains the full MySQL schema
- `graphify-out/` contains the generated code graph artifacts

## Run locally

### Backend


```powershell
cd backend
Copy-Item .env.example .env
npm.cmd install
npm.cmd start
```

Optional:

- set `EVALUATION_API_TOKEN` in `backend/.env` to call the protected live API
- set MySQL connection values in `backend/.env` to persist read-state in MySQL

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm.cmd install
npm.cmd dev
```

The frontend is configured to run on `http://localhost:3000`.

## Stage 6 script

```powershell
cd backend
npm.cmd run priority
```


