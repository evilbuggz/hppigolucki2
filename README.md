# Peachy watermark side-site

Deploy this folder as its own Vercel project.

- **Root Directory:** `side-site`
- **Framework Preset:** Other
- **Build Command:** leave empty
- **Output Directory:** leave empty
- **Install Command:** `npm install`

The side-site calls the Render service at `https://hpy-chry-go-lucki.onrender.com` for fresh media sources. Its `/api/download` function uses `ffmpeg-static` to apply the watermark and streams the processed MP4 back to the browser.

Vercel function limits still apply. Large or long videos may exceed the function duration or memory limits; the Render PHP downloader remains the more suitable path for those files.
