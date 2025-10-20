<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Cakes and Memories Cebu Order Form

This contains everything you need to run your app locally and deploy it to production.

View your app in AI Studio: https://ai.studio/apps/drive/1VhejYSclqjnTZAbwsMwgTuA-VuhVBHEp

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. Run the app:
   ```bash
   npm run dev
   ```

## Deployment

For deployment instructions, please refer to:

- [Deployment Guide](docs/DEPLOYMENT.md) - Complete deployment instructions
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md) - Step-by-step verification
- [Deployment Summary](DEPLOYMENT_SUMMARY.md) - Summary of all changes made

### Quick Deployment Steps

1. Set the required environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`

2. Build the application:
   ```bash
   npm run build
   ```

3. Deploy the contents of the `dist` folder to your hosting provider

### Environment Variables

Create a `.env.production` file with the following variables:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key
```