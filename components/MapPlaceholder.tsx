import React, { useState, useEffect } from 'react';

interface MapPlaceholderProps {
    address?: string;
    coordinates?: { lat: number; lng: number };
}

const MapPlaceholder = ({ address, coordinates }: MapPlaceholderProps): React.JSX.Element => {
    const [mapUrl, setMapUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Use environment variable for API key
    const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDThtN_G7khUxdZy6rVPgI0zpsyPS30ryE';

    useEffect(() => {
        // Reset map url when address is cleared
        if (!address) {
            setMapUrl(null);
            return;
        }

        // If we have coordinates, use them directly for best performance
        if (coordinates) {
            generateStaticMap(coordinates.lat, coordinates.lng);
        } 
        // If we have an address but no coordinates, geocode it as a fallback
        else if (address) {
            geocodeAddress(address);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, coordinates]);

    const geocodeAddress = async (addr: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${API_KEY}`
            );
            const data = await response.json();
            
            if (data.results && data.results[0]) {
                const { lat, lng } = data.results[0].geometry.location;
                generateStaticMap(lat, lng);
            } else {
                setMapUrl(null); // Clear map if geocoding fails
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            setMapUrl(null);
        } finally {
            setIsLoading(false);
        }
    };

    const generateStaticMap = (lat: number, lng: number) => {
        // Google Static Maps API URL
        const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?` +
            `center=${lat},${lng}` +
            `&zoom=16` +
            `&size=600x300` +
            `&scale=2` +
            `&markers=color:0xEC5685%7C${lat},${lng}` +
            `&style=feature:poi%7Cvisibility:simplified` +
            `&key=${API_KEY}`;
        
        setMapUrl(staticMapUrl);
    };

    // Show loading state
    if (isLoading) {
        return (
            <div className="w-full h-[200px] rounded-2xl bg-gray-200 flex items-center justify-center border border-gray-300 mb-4">
                <div className="text-center text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal mx-auto mb-2"></div>
                    <p className="text-sm font-medium">Loading map...</p>
                </div>
            </div>
        );
    }

    // Show actual map if we have the URL
    if (mapUrl) {
        return (
            <div className="w-full h-[200px] rounded-2xl overflow-hidden border border-gray-300 mb-4 relative group">
                <img 
                    src={mapUrl} 
                    alt="Delivery location map"
                    className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs text-white font-medium truncate">{address}</p>
                    <p className="text-xs text-white/80 mt-1">Click address field above to change</p>
                </div>
            </div>
        );
    }

    // Default placeholder when no address is yet selected
    return (
        <div className="w-full h-[200px] rounded-2xl bg-gray-200 flex items-center justify-center border border-gray-300 mb-4">
            <div className="text-center text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-8 w-8 text-gray-400 mb-2">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <p className="text-sm font-medium">Map Preview Appears Here</p>
                <p className="text-xs">Select a delivery address to see the map</p>
            </div>
        </div>
    );
};

export default MapPlaceholder;
