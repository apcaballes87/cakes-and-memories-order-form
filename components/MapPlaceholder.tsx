import React, { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { googleMapsApiKey } from '../services/googleMaps';

interface MapPlaceholderProps {
    address?: string;
    coordinates?: { lat: number; lng: number } | null;
}

const MapPlaceholder = ({ address, coordinates }: MapPlaceholderProps): React.JSX.Element => {
    const [imageFailed, setImageFailed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const hasUsableCoordinates = Boolean(
        coordinates &&
        Number.isFinite(coordinates.lat) &&
        Number.isFinite(coordinates.lng) &&
        !(coordinates.lat === 0 && coordinates.lng === 0),
    );

    const mapUrl = useMemo(() => {
        if (!googleMapsApiKey || !coordinates || !hasUsableCoordinates) return null;

        const params = new URLSearchParams({
            center: `${coordinates.lat},${coordinates.lng}`,
            zoom: '16',
            size: '600x300',
            scale: '2',
            markers: `color:0xEC5685|${coordinates.lat},${coordinates.lng}`,
            style: 'feature:poi|visibility:simplified',
            key: googleMapsApiKey,
        });
        return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    }, [coordinates, hasUsableCoordinates]);

    const googleMapsLink = useMemo(() => {
        const query = hasUsableCoordinates && coordinates
            ? `${coordinates.lat},${coordinates.lng}`
            : address?.trim();
        if (!query) return null;

        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }, [address, coordinates, hasUsableCoordinates]);

    useEffect(() => {
        setImageFailed(false);
        setIsLoading(Boolean(mapUrl));
    }, [mapUrl]);

    if (mapUrl && !imageFailed) {
        return (
            <div className="w-full h-[200px] rounded-2xl overflow-hidden border border-gray-300 mb-4 relative bg-gray-100" aria-label="Delivery location map preview">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal mx-auto mb-2" />
                            <p className="text-sm font-medium">Loading map preview...</p>
                        </div>
                    </div>
                )}
                <img
                    src={mapUrl}
                    alt="Delivery location map"
                    className={`w-full h-full object-cover pointer-events-none ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                        setIsLoading(false);
                        setImageFailed(true);
                    }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs text-white font-medium truncate">{address}</p>
                    <p className="text-xs text-white/80 mt-1">Preview only — use the address field above to change it</p>
                </div>
            </div>
        );
    }

    const hasAddress = Boolean(address?.trim());

    return (
        <div className="w-full min-h-[160px] rounded-2xl bg-gray-100 flex items-center justify-center border border-gray-300 mb-4 p-5">
            <div className="text-center text-gray-600">
                <MapPin className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm font-medium">
                    {hasAddress ? 'Map preview unavailable' : 'Map preview appears here'}
                </p>
                <p className="text-xs mt-1">
                    {hasAddress
                        ? 'Your typed delivery address is still saved and can be used without a map pin.'
                        : 'Add a complete delivery address to continue.'}
                </p>
                {hasAddress && googleMapsLink && (
                    <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-sm text-primary hover:underline font-medium mt-3"
                    >
                        View this address in Google Maps
                    </a>
                )}
            </div>
        </div>
    );
};

export default MapPlaceholder;
