# AI Resume Toolkit — Frontend

Next.js 15 frontend for the AI Resume Toolkit.

## Development

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:3000

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (default: `http://localhost:8000`) |

## Deployment

Deploy to Vercel. Set `NEXT_PUBLIC_API_URL` to your Render backend URL in the Vercel project settings.

See the [root README](../README.md) for full deployment instructions.
