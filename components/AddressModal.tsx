import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, LocateFixed, LoaderCircle } from 'lucide-react';
// FIX: The `Loader` class from `@googlemaps/js-api-loader` was potentially conflicting with a `Loader` component from another library.
// Aliasing it to `GoogleMapsLoader` resolves the name collision and the associated TypeScript error.
import { Loader as GoogleMapsLoader } from '@googlemaps/js-api-loader';

// FIX: Add stubs for Google Maps types to resolve compilation errors caused by a missing @types/google.maps package.
// For a production environment, it is recommended to install the official type definitions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleMapsMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleMapsGeocoder = any;
type GoogleMapsLatLngLiteral = { lat: number; lng: number };

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selection: { address: string; coordinates: { lat: number; lng: number } }) => void;
}

const AddressModal: React.FC<AddressModalProps> = ({ isOpen, onClose, onSelect }) => {
    const [pinnedAddress, setPinnedAddress] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // FIX: Use the GoogleMapsMap type stub to avoid type errors.
    const mapInstance = useRef<GoogleMapsMap | null>(null);
    // FIX: Use the GoogleMapsGeocoder type stub to avoid type errors.
    const geocoder = useRef<GoogleMapsGeocoder | null>(null);

    // Default center set to Cebu City
    const defaultCenter = { lat: 10.31253, lng: 123.895453 };
    // FIX: Completed the useState declaration which was causing multiple syntax errors.
    const [pinnedCoordinates, setPinnedCoordinates] = useState<GoogleMapsLatLngLiteral>(defaultCenter);

    useEffect(() => {
        if (!isOpen) return;

        const loader = new GoogleMapsLoader({
            apiKey: 'AIzaSyDThtN_G7khUxdZy6rVPgI0zpsyPS30ryE', // Same API key from MapPlaceholder
            version: 'weekly',
            libraries: ['places', 'geocoding']
        });

        loader.load().then((google) => {
            if (!mapRef.current || !inputRef.current) return;
            setIsLoading(false);
            
            geocoder.current = new google.maps.Geocoder();
            
            mapInstance.current = new google.maps.Map(mapRef.current, {
                center: defaultCenter,
                zoom: 15,
                disableDefaultUI: true,
                gestureHandling: 'cooperative',
            });

            const autocomplete = new google.maps.places.Autocomplete(inputRef.current);
            autocomplete.bindTo('bounds', mapInstance.current);

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.geometry?.location) {
                    mapInstance.current?.setCenter(place.geometry.location);
                    const newCoords = place.geometry.location.toJSON();
                    setPinnedCoordinates(newCoords);
                    reverseGeocode(newCoords);
                }
            });

            mapInstance.current.addListener('dragend', () => {
                const center = mapInstance.current?.getCenter();
                if (center) {
                    const newCoords = center.toJSON();
                    setPinnedCoordinates(newCoords);
                    reverseGeocode(newCoords);
                }
            });

            reverseGeocode(defaultCenter);

        }).catch(e => {
            console.error('Error loading Google Maps:', e);
            setError('Failed to load map. Please check your internet connection and try again.');
            setIsLoading(false);
        });

    }, [isOpen]);

    const reverseGeocode = (coords: GoogleMapsLatLngLiteral) => {
        if (!geocoder.current) return;
        geocoder.current.geocode({ location: coords }, (results: any, status: any) => {
            if (status === 'OK' && results?.[0]) {
                setPinnedAddress(results[0].formatted_address);
                // Don't automatically set deliveryAddress - let users input it manually
                // setDeliveryAddress(results[0].formatted_address);
            } else {
                setPinnedAddress('Address not found');
            }
        });
    };

    const handleUseCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    mapInstance.current?.setCenter(coords);
                    setPinnedCoordinates(coords);
                    reverseGeocode(coords);
                },
                () => {
                    setError('Unable to retrieve your location. Please enable location services.');
                }
            );
        } else {
            setError('Geolocation is not supported by your browser.');
        }
    };
    
    const handleConfirm = () => {
        // Allow user to enter a complete address independently of the map
        if (deliveryAddress) {
            onSelect({
                address: deliveryAddress,
                coordinates: pinnedCoordinates,
            });
        }
    };

    // Reset the delivery address when the modal opens or when coordinates change
    useEffect(() => {
        if (isOpen) {
            setDeliveryAddress(''); // Start with a blank address field
        }
    }, [isOpen, pinnedCoordinates]);

    if (!isOpen) return null;

    // FIX: The component now returns JSX, resolving the React.FC type error.
    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg h-[90vh] max-h-[700px] flex flex-col overflow-hidden">
                <header className="p-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">Set Delivery Location</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">
                        <X size={20} />
                    </button>
                </header>
                
                <div className="relative flex-grow">
                    {isLoading && (
                         <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
                            <LoaderCircle className="animate-spin text-primary" size={32} />
                         </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 bg-red-50 flex items-center justify-center z-10 p-4">
                            <p className="text-center text-red-600">{error}</p>
                        </div>
                    )}
                    <div ref={mapRef} className="w-full h-full" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
                        <MapPin size={40} className="text-primary drop-shadow-lg" />
                    </div>
                    <button onClick={handleUseCurrentLocation} className="absolute bottom-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg text-gray-700 hover:bg-gray-100" aria-label="Use current location">
                        <LocateFixed size={20} />
                    </button>
                </div>

                <div className="p-4 bg-gray-50 border-t">
                    <div className="relative mb-2">
                         <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search for a location or address"
                            className="w-full px-4 py-3 border border-primaryLight rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal"
                        />
                    </div>

                    <p className="text-sm font-medium text-gray-800 mb-1">Pinned Location:</p>
                    <p className="text-xs text-gray-600 mb-2 min-h-[16px]">{pinnedAddress || 'Drag map to set location'}</p>

                    <label htmlFor="complete-address" className="block text-sm font-medium text-gray-700 mb-1">Complete Address</label>
                    <input
                        id="complete-address"
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Enter your complete address here (e.g. Unit 123, Bldg. 4, Street Name, Barangay, City)"
                        className="w-full px-4 py-3 border border-primaryLight rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal mb-4"
                    />

                    <button
                        onClick={handleConfirm}
                        disabled={!deliveryAddress}
                        className="w-full bg-primary text-white font-bold py-3 px-4 rounded-2xl hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        Confirm Address
                    </button>
                </div>
            </div>
        </div>
    );
};

// FIX: Added default export to resolve import error in OrderForm.tsx.
export default AddressModal;
