# Vercel Deployment Instructions

## Step 1: Deploy to Vercel

1. Go to https://vercel.com/new
2. Sign in with your GitHub account
3. Select your repository: `apcaballes87/cakes-and-memories-order-form`
4. Click "Deploy"

## Step 2: Add Environment Variables

After the initial deployment completes, you need to add environment variables:

1. Go to your project dashboard in Vercel
2. Click "Settings" tab
3. Click "Environment Variables" in the sidebar
4. Add these variables:

### Required Environment Variables:

1. Name: `VITE_SUPABASE_URL`
   Value: `https://congofivupobtfudnhni.supabase.co`
   (This is the fallback value - replace with your own Supabase project URL if you have one)

2. Name: `VITE_SUPABASE_ANON_KEY`
   Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM`
   (This is the fallback value - replace with your own Supabase anon key if you have one)

3. Name: `GEMINI_API_KEY`
   Value: (Your Google Maps API key)

## Step 3: Redeploy

After adding environment variables:

1. Go back to the "Deployments" tab
2. Click the "Redeploy" button
3. Wait for the new deployment to complete

## Your Application Will Be Live

Once redeployment is complete, your application will be accessible at a URL like:
`https://cakes-and-memories-order-form.vercel.app`

## Note About Supabase

The application currently uses a fallback Supabase project. For production use, you should:

1. Create your own Supabase project at https://supabase.com/
2. Replace the environment variables with your project's URL and anon key
3. Create a public bucket named "cakepics" in your Supabase Storage