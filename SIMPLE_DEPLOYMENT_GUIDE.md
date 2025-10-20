# Simple Deployment Guide

Don't worry if you're not familiar with deployment - I'll walk you through the process step by step.

## What You'll Need

1. A free account with Vercel (https://vercel.com) or Netlify (https://netlify.com)
2. Your Supabase credentials (URL and anon key)
3. Your Google Maps API key

## Step-by-Step Deployment (Using Vercel)

### Step 1: Create a GitHub Repository
1. Go to https://github.com and sign in or create an account
2. Click the "+" icon in the top right and select "New repository"
3. Name it something like "cakes-and-memories-order-form"
4. Keep it Public
5. Don't initialize with a README (we'll push our existing code)

### Step 2: Push Your Code to GitHub
Open your terminal and run these commands one by one:

```bash
cd /Users/apcaballes/cakes-and-memories-cebu-order-form
git init
git add .
git commit -m "Initial commit"
git branch -M main
```

Then follow GitHub's instructions to push to your new repository (they'll show you the exact commands).

### Step 3: Deploy to Vercel
1. Go to https://vercel.com and sign up/sign in
2. Click "New Project"
3. Click "Import" next to your GitHub repository
4. Click "Deploy" (Vercel will automatically detect it's a Vite app)

### Step 4: Add Environment Variables
While Vercel is building your app (it takes 1-2 minutes):
1. Go to your project settings in Vercel
2. Click "Environment Variables" in the sidebar
3. Add these three variables:
   - Name: `VITE_SUPABASE_URL`, Value: (your Supabase URL)
   - Name: `VITE_SUPABASE_ANON_KEY`, Value: (your Supabase anon key)
   - Name: `GEMINI_API_KEY`, Value: (your Google Maps API key)

### Step 5: Redeploy
1. After adding environment variables, trigger a new deployment
2. Click "Deployments" in the sidebar
3. Click the three dots next to the latest deployment
4. Select "Redeploy"

## That's It!

Your app will be live at a URL like: `your-app-name.vercel.app`

## Need Help With Specific Steps?

If you get stuck on any step, just let me know which one and I'll provide more detailed instructions.