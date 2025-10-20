# Local Testing Guide

## Running the Application Locally

To run the application on your local machine:

```bash
cd /Users/apcaballes/cakes-and-memories-cebu-order-form
npm run dev
```

The application will start on port 3000 and can be accessed at:
- Local: http://localhost:3000/
- Network: http://192.168.1.17:3000/

## Testing Different Parts of the Application

After starting the development server, you can access the local testing page at:
http://localhost:3000/test-local.html

This page provides convenient links to test all parts of your application:

1. **Order Form with 1 product**: Tests the basic order form
2. **Order Form with 3 products**: Tests the form with multiple products
3. **Thank You Page**: Tests the submission confirmation page

## What to Test

When testing locally, verify that:

1. The form loads correctly
2. All form fields are functional
3. File upload works (for cake pictures)
4. Map displays correctly
5. Form submission works
6. Navigation between pages works

## Stopping the Development Server

To stop the development server, press `Ctrl + C` in the terminal where it's running.

## Environment Variables

For local testing, make sure you have a `.env.local` file in the project root with your Google Maps API key:

```
GEMINI_API_KEY=your_google_maps_api_key_here
```

## Troubleshooting

If you encounter issues:

1. Make sure all dependencies are installed: `npm install`
2. Check that the development server is running
3. Verify your API keys are correctly set in `.env.local`
4. Check the browser console for any error messages