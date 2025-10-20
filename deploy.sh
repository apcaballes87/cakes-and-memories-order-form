#!/bin/bash

# Deployment script for Cakes and Memories Order Form

echo "🚀 Starting deployment process..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

echo "✅ Found project files"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🏗️ Building the project..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Instructions for deployment
    echo ""
    echo "📋 Deployment Instructions:"
    echo "1. Go to https://vercel.com/new"
    echo "2. Sign in with your GitHub account"
    echo "3. Select repository: apcaballes87/cakes-and-memories-order-form"
    echo "4. Click 'Deploy'"
    echo ""
    echo "🔧 After deployment, add these environment variables in Vercel settings:"
    echo "   - VITE_SUPABASE_URL: https://congofivupobtfudnhni.supabase.co"
    echo "   - VITE_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbmdvZml2dXBvYnRmdWRuaG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODc1NjkyMTQsImV4cCI6MjAwMzE0NTIxNH0.y2jsrPWt7Q_016e1o8PkM-Ayyti9yzxj3jH9hvH4DiM"
    echo "   - GEMINI_API_KEY: [your Google Maps API key]"
    echo ""
    echo "🔄 After adding environment variables, redeploy your application"
    echo ""
    echo "🌐 Your application will be live at: https://cakes-and-memories-order-form.vercel.app"
    echo ""
    echo "🎉 Deployment preparation complete!"
else
    echo "❌ Build failed. Please check the error messages above."
    exit 1
fi