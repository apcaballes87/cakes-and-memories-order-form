# Deployment Checklist

This checklist ensures that all necessary steps have been taken to prepare the Cakes and Memories Cebu Order Form application for deployment.

## ✅ Environment Configuration

- [x] Created `.env.example` file with required environment variables
- [x] Updated Supabase client to use environment variables instead of hardcoded values
- [x] Added TypeScript definitions for environment variables

## ✅ Build Configuration

- [x] Added vite-tsconfig-paths plugin for better path resolution
- [x] Configured production build optimization in vite.config.ts
- [x] Set up manual chunking for better caching
- [x] Verified successful build process

## ✅ Static Assets

- [x] Created `public` directory for static assets
- [x] Added health check file (`health.html`)
- [x] Added `robots.txt` for SEO
- [x] Added `manifest.json` for PWA capabilities

## ✅ HTML Enhancements

- [x] Added meta description to index.html
- [x] Added manifest link to index.html
- [x] Added theme color meta tag to index.html

## ✅ Documentation

- [x] Created detailed deployment guide in `docs/DEPLOYMENT.md`
- [x] Verified README.md has basic local development instructions

## ✅ Testing

- [x] Verified build process completes successfully
- [x] Verified static assets are included in build output

## Deployment Steps

1. Set environment variables in deployment environment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`

2. Run build command:
   ```bash
   npm run build
   ```

3. Deploy contents of `dist` folder to your hosting provider

4. Verify deployment by accessing `/health.html` endpoint

## Post-Deployment Verification

- [ ] Verify application loads correctly
- [ ] Verify form submission works
- [ ] Verify file uploads work (requires Supabase bucket)
- [ ] Verify Google Maps integration works
- [ ] Verify all environment variables are properly configured