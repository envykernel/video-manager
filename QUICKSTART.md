# Quick Start Guide

---

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Node.js 18+](https://nodejs.org/)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)

---

## 1. Start MongoDB

```bash
cd backend-api
docker compose up -d
```

This starts:
- **MongoDB** on `localhost:27017`
- **Mongo Express** (DB admin UI) on `http://localhost:8081`

---

## 2. Install & Run ngrok with Docker

ngrok creates a public tunnel to your local backend, which is required for:
- **Mux webhooks** — Mux needs a public URL to send video processing events
- **Mobile upload** — QR code links need to be accessible from a phone

### Option A: Run ngrok with Docker (recommended)

```bash
docker run -d \
  --name ngrok \
  --net=host \
  -e NGROK_AUTHTOKEN=<your-ngrok-auth-token> \
  ngrok/ngrok:latest \
  http 5129 \
  --url <your-ngrok-static-domain>
```

> Get your auth token at https://dashboard.ngrok.com/get-started/your-authtoken
> Get a free static domain at https://dashboard.ngrok.com/domains

### Option B: Run ngrok directly (if installed locally)

```bash
ngrok http 5129 --url <your-ngrok-static-domain>
```

### Verify ngrok is running

Open `http://localhost:4040` in your browser to see the ngrok dashboard and inspect incoming requests.

---

## 3. Configure the Backend

Edit `backend-api/appsettings.Development.json` with your values:

```json
{
  "Mux": {
    "TokenId": "<your-mux-token-id>",
    "TokenSecret": "<your-mux-token-secret>"
  },
  "App": {
    "BaseUrl": "https://<your-ngrok-domain>.ngrok-free.dev"
  },
  "MongoDB": {
    "ConnectionString": "mongodb://localhost:27017/?directConnection=true",
    "DatabaseName": "video_platform"
  }
}
```

---

## 4. Link Mux Webhooks to ngrok

1. Go to your [Mux Dashboard](https://dashboard.mux.com/) > **Settings** > **Webhooks**
2. Click **Create new webhook**
3. Set the URL to:

```
https://<your-ngrok-domain>.ngrok-free.dev/api/webhooks/mux
```

4. Select these events (or "Send all"):
   - `video.upload.asset_created` — links the uploaded file to a Mux asset
   - `video.asset.ready` — marks the video as ready with a playback ID
   - `video.asset.errored` — marks the video as failed

5. Save the webhook

### Test the webhook

Upload a video through the app. You should see webhook events in:
- The ngrok dashboard at `http://localhost:4040`
- The backend logs in your terminal

---

## 5. Run the Backend

```bash
cd backend-api
dotnet run
```

Backend starts at `http://localhost:5129`.

---

## 6. Run the Frontend

```bash
cd frontend-video-platform
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`. The Vite dev server proxies `/api` requests to the backend.

---

## 7. Mobile Upload (QR Code)

The mobile upload feature lets you scan a QR code on your phone to upload videos directly.

For this to work:
- ngrok must be running (so your phone can reach the backend)
- `App:BaseUrl` in `appsettings.Development.json` must match your ngrok URL

The flow:
1. The frontend generates a temporary upload token via `POST /api/mobile-upload/token`
2. A QR code is displayed containing `https://<ngrok-url>/mobile-upload/<token>`
3. Scanning the QR code opens a mobile upload page served by `MobilePageController`
4. The phone uploads directly to Mux via the upload URL
5. The frontend polls `GET /api/mobile-upload/token/<token>/videos` to detect new uploads

---

## Full Startup (all commands)

```bash
# Terminal 1 — MongoDB
cd backend-api
docker compose up -d

# Terminal 2 — ngrok
docker run -d --name ngrok --net=host \
  -e NGROK_AUTHTOKEN=<your-ngrok-auth-token> \
  ngrok/ngrok:latest http 5129 --url <your-ngrok-static-domain>

# Terminal 3 — Backend
cd backend-api
dotnet run

# Terminal 4 — Frontend
cd frontend-video-platform
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/videos` | List all videos |
| `POST` | `/api/videos/upload` | Create a direct upload URL |
| `DELETE` | `/api/videos/{id}` | Delete a video |
| `POST` | `/api/webhooks/mux` | Mux webhook receiver |
| `POST` | `/api/mobile-upload/token` | Generate mobile upload token |
| `GET` | `/api/mobile-upload/token/{token}/validate` | Validate a token |
| `POST` | `/api/mobile-upload/token/{token}/upload` | Create upload from mobile |
| `GET` | `/api/mobile-upload/token/{token}/videos` | List videos for a token |
| `GET` | `/mobile-upload/{token}` | Mobile upload HTML page |
