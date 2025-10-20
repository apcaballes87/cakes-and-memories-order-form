# Deployment Guide

This document provides instructions for deploying the Cakes and Memories Cebu Order Form application.

## Prerequisites

1. Node.js (version 16 or higher)
2. npm (comes with Node.js)
3. A Supabase account
4. A Google Maps API key

## Environment Variables

Before building for production, ensure you have the following environment variables set in a `.env.production` file:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GEMINI_API_KEY=your_gemini_api_key
```

You can use the `.env.example` file as a template:

```bash
cp .env.example .env.production
# Then edit .env.production with your actual values
```

## Build Process

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the application:
   ```bash
   npm run build
   ```

   The build output will be in the `dist` folder.

## Deployment

### Option 1: Deploy to Vercel/Netlify

1. Push your code to a Git repository
2. Connect your repository to Vercel or Netlify
3. Set the environment variables in the platform's dashboard
4. Configure the build command as `npm run build`
5. Configure the output directory as `dist`

### Option 2: Manual Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Copy the contents of the `dist` folder to your web server

## Supabase Configuration

Ensure you have created a public bucket named `cakepics` in your Supabase Storage for file uploads to work correctly.

## Google Maps API

Make sure your Google Maps API key has the necessary permissions for the Google Maps JavaScript API and Google Maps Static API.

## Testing the Production Build

To test the production build locally:

```bash
npm run build
npm run preview
```

This will start a local server to preview the production build.