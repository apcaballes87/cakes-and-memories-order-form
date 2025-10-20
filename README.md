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
2. Set the `GEMINI_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` in `.env.local` to your API keys
3. Run the app:
   ```bash
   npm run dev
   ```

### Accessing the Application

Once the development server is running, you can access:

- **Main Application**: http://localhost:3000/order/default-user/1
- **Local Testing Page**: http://localhost:3000/test-local.html (provides convenient links to all parts of the app)
- **Local Testing Guide**: [LOCAL_TESTING.md](LOCAL_TESTING.md)

### Testing Different Parts

The local testing page provides links to:
- Order form with 1 product
- Order form with 3 products
- Thank you page

## Deployment

For deployment instructions, please refer to:

- [Deployment Guide](docs/DEPLOYMENT.md) - Complete deployment instructions
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md) - Step-by-step verification
- [Deployment Summary](DEPLOYMENT_SUMMARY.md) - Summary of all changes made
- [Simple Deployment Guide](SIMPLE_DEPLOYMENT_GUIDE.md) - Easy step-by-step deployment

### Quick Deployment Steps

1. Set the required environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
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
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GEMINI_API_KEY=your_google_maps_api_key
```