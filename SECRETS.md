# Project Secrets & Configuration

> **WARNING:** This file contains real secret values. Do NOT commit to version control.

---

## Backend API — Mux Video API

| Key | Config Path | Value |
|-----|-------------|-------|
| Token ID | `Mux:TokenId` | `a44ccb68-2f9e-4681-b295-4d48aa9d7d91` |
| Token Secret | `Mux:TokenSecret` | `mUhuAploEyilOolflkA2742isxgWrbhNh/MVNi2GourgMvNywOyaBTwgylnHPvVUmo47IgL9grN` |
| Environment ID | `Mux:EnvironmentId` | `4h897q` |

Source: `backend-api/appsettings.Development.json`

---

## Backend API — MongoDB

| Key | Config Path | Value |
|-----|-------------|-------|
| Connection String | `MongoDB:ConnectionString` | `mongodb://localhost:27017/?directConnection=true` |
| Database Name | `MongoDB:DatabaseName` | `video_platform` |

Source: `backend-api/appsettings.Development.json`

---

## Backend API — App Configuration

| Key | Config Path | Value |
|-----|-------------|-------|
| Base URL (ngrok) | `App:BaseUrl` | `https://twiddly-nonadministrable-timika.ngrok-free.dev` |

Used for CORS in `backend-api/Program.cs` and mobile upload URL in `MobileUploadController.cs`.

---

## ngrok

| Key | Value |
|-----|-------|
| Auth Token | `3BjT3EXVvclUkKHxXzxQ3TfMaYV_2VBe4HherDPMo9xTM5UEj` |
| Static Domain | `twiddly-nonadministrable-timika.ngrok-free.dev` |

Used to expose the backend (`localhost:5129`) publicly for Mux webhooks and mobile upload.

---

## Frontend — Vite Proxy

| Key | File | Value |
|-----|------|-------|
| API Proxy Target | `frontend-video-platform/vite.config.ts` | `http://localhost:5129` |
| API Base Path | `src/App.tsx`, `src/MobileUploadPage.tsx`, `src/QRUploadSection.tsx` | `/api` |

---

## Infrastructure — Docker Compose

| Key | Value |
|-----|-------|
| MongoDB Port | `27017` |
| MongoDB Internal URL | `mongodb://mongo:27017` |
| Mongo Express Port | `8081` |
| Mongo Express Auth | Disabled (`ME_CONFIG_BASICAUTH: "false"`) |

Source: `backend-api/docker-compose.yml`

---

## Backend API — Server URLs

| Profile | URL |
|---------|-----|
| HTTP | `http://localhost:5129` |
| HTTPS | `https://localhost:7051` |

Source: `backend-api/Properties/launchSettings.json`

---

## GitHub Repository

| Key | Value |
|-----|-------|
| Remote URL (SSH) | `git@github.com-mbensaidtech:mbensaidtech/video-platform.git` |
| SSH Identity File | `~/.ssh/id_ed25519_mbensaidtech` |
