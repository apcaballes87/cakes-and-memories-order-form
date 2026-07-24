import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, MapPin, LocateFixed, LoaderCircle } from 'lucide-react';
import {
    googleMapsApiKey,
    loadGoogleMapsLibraries,
} from '../services/googleMaps';

type Coordinates = { lat: number; lng: number };

export interface AddressSelection {
    address: string;
    coordinates: Coordinates | null;
    source: 'map' | 'manual';
}

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selection: AddressSelection) => void;
    currentSelection?: AddressSelection | null;
}

const CEBU_CITY_CENTER: Coordinates = { lat: 10.3157, lng: 123.8854 };
const CEBU_CITY_SEARCH_RADIUS_METERS = 15_000;
const CEBU_CITY_SEARCH_BOUNDS = {
    north: CEBU_CITY_CENTER.lat + (CEBU_CITY_SEARCH_RADIUS_METERS / 111_320),
    south: CEBU_CITY_CENTER.lat - (CEBU_CITY_SEARCH_RADIUS_METERS / 111_320),
    east: CEBU_CITY_CENTER.lng + (CEBU_CITY_SEARCH_RADIUS_METERS / (111_320 * Math.cos(CEBU_CITY_CENTER.lat * Math.PI / 180))),
    west: CEBU_CITY_CENTER.lng - (CEBU_CITY_SEARCH_RADIUS_METERS / (111_320 * Math.cos(CEBU_CITY_CENTER.lat * Math.PI / 180))),
};
const MAP_READY_TIMEOUT_MS = 10_000;
const isUsableCoordinates = (coordinates: Coordinates | null): coordinates is Coordinates => Boolean(
    coordinates &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    !(coordinates.lat === 0 && coordinates.lng === 0),
);

const distanceFromCebuCityMeters = ({ lat, lng }: Coordinates) => {
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = toRadians(lat - CEBU_CITY_CENTER.lat);
    const longitudeDelta = toRadians(lng - CEBU_CITY_CENTER.lng);
    const originLatitude = toRadians(CEBU_CITY_CENTER.lat);
    const destinationLatitude = toRadians(lat);
    const a = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;

    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const AddressModal: React.FC<AddressModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    currentSelection,
}) => {
    const [pinnedAddress, setPinnedAddress] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [pinnedCoordinates, setPinnedCoordinates] = useState<Coordinates | null>(null);
    const isManualMode = !googleMapsApiKey;
    const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [addressError, setAddressError] = useState<string | null>(null);
    const [isAutocompleteAvailable, setIsAutocompleteAvailable] = useState(true);

    const mapRef = useRef<HTMLDivElement>(null);
    const autocompleteRef = useRef<HTMLDivElement>(null);
    const completeAddressRef = useRef<HTMLInputElement>(null);
    const mapInstance = useRef<any>(null);
    const mapReadyRef = useRef(false);
    const geocoder = useRef<any>(null);
    const cleanupListeners = useRef<Array<() => void>>([]);
    const lifecycleId = useRef(0);
    const geocodeRequestId = useRef(0);
    const placeRequestId = useRef(0);
    const isOpenRef = useRef(isOpen);
    const pendingLocation = useRef<{ coordinates: Coordinates; timeoutId: number } | null>(null);

    useEffect(() => {
        isOpenRef.current = isOpen;
        if (!isOpen && pendingLocation.current) {
            window.clearTimeout(pendingLocation.current.timeoutId);
            pendingLocation.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        setError(null);
        setAddressError(null);

        if (currentSelection) {
            setDeliveryAddress(currentSelection.address);
            setPinnedCoordinates(currentSelection.coordinates);
        }
    }, [currentSelection, isOpen]);

    const clearMapResources = useCallback(() => {
        cleanupListeners.current.forEach((removeListener) => removeListener());
        cleanupListeners.current = [];
        autocompleteRef.current?.replaceChildren();
        mapInstance.current = null;
        mapReadyRef.current = false;
        geocoder.current = null;
        geocodeRequestId.current += 1;
        placeRequestId.current += 1;
    }, []);

    const reverseGeocode = useCallback(async (coordinates: Coordinates) => {
        if (!geocoder.current) return;

        const requestId = ++geocodeRequestId.current;
        try {
            const response = await geocoder.current.geocode({ location: coordinates });
            if (
                requestId !== geocodeRequestId.current ||
                !isOpenRef.current
            ) return;

            setPinnedAddress(response.results?.[0]?.formatted_address || 'Pin selected');
        } catch {
            if (requestId === geocodeRequestId.current && isOpenRef.current) {
                setPinnedAddress('Pin selected');
            }
        }
    }, []);

    useEffect(() => {
        if (!isOpen || isManualMode || !googleMapsApiKey) {
            if (isOpen && (isManualMode || !googleMapsApiKey)) {
                setMapStatus('idle');
            }
            clearMapResources();
            return;
        }

        const currentLifecycleId = ++lifecycleId.current;
        let disposed = false;

        setMapStatus('loading');
        setError(null);
        clearMapResources();

        loadGoogleMapsLibraries()
            .then(({ Map, Geocoder, PlaceAutocompleteElement }) => {
                if (
                    disposed ||
                    currentLifecycleId !== lifecycleId.current ||
                    !mapRef.current
                ) return;

                geocoder.current = new Geocoder();
                const initialCoordinates = currentSelection?.coordinates ?? pinnedCoordinates;
                mapInstance.current = new Map(mapRef.current, {
                    center: initialCoordinates ?? CEBU_CITY_CENTER,
                    zoom: initialCoordinates ? 16 : 13,
                    disableDefaultUI: true,
                    gestureHandling: 'cooperative',
                });

                const dragListener = mapInstance.current.addListener('dragend', () => {
                    const center = mapInstance.current?.getCenter();
                    if (!center || !isOpenRef.current) return;

                    const coordinates = center.toJSON() as Coordinates;
                    setPinnedCoordinates(coordinates);
                    setPinnedAddress('Finding pinned location...');
                    setError(null);
                    void reverseGeocode(coordinates);
                });
                cleanupListeners.current.push(() => dragListener.remove());

                if (PlaceAutocompleteElement && autocompleteRef.current) {
                    setIsAutocompleteAvailable(true);
                    const autocomplete = new PlaceAutocompleteElement();
                    autocomplete.setAttribute('aria-label', 'Search within 15 km of Cebu City');
                    autocomplete.style.width = '100%';
                    (autocomplete as any).includedRegionCodes = ['ph'];
                    (autocomplete as any).locationRestriction = CEBU_CITY_SEARCH_BOUNDS;

                    const handlePlaceSelect = async (event: Event) => {
                        const requestId = ++placeRequestId.current;
                        const placePrediction = (event as any).placePrediction;
                        if (!placePrediction) return;

                        try {
                            const place = placePrediction.toPlace();
                            await place.fetchFields({
                                fields: ['formattedAddress', 'location'],
                            });
                            if (
                                requestId !== placeRequestId.current ||
                                currentLifecycleId !== lifecycleId.current ||
                                !isOpenRef.current ||
                                !place.location
                            ) return;

                            const coordinates = place.location.toJSON() as Coordinates;
                            if (distanceFromCebuCityMeters(coordinates) > CEBU_CITY_SEARCH_RADIUS_METERS) {
                                setError('Choose a location within 15 km of Cebu City.');
                                return;
                            }
                            mapInstance.current?.setCenter(coordinates);
                            mapInstance.current?.setZoom(16);
                            setPinnedCoordinates(coordinates);
                            setPinnedAddress(place.formattedAddress || 'Pin selected');
                            setError(null);
                        } catch {
                            if (requestId === placeRequestId.current && isOpenRef.current) {
                                setError('That map result could not be loaded. Try another search or enter the address manually.');
                            }
                        }
                    };

                    autocomplete.addEventListener('gmp-select', handlePlaceSelect);
                    cleanupListeners.current.push(() => {
                        autocomplete.removeEventListener('gmp-select', handlePlaceSelect);
                    });
                    autocompleteRef.current.replaceChildren(autocomplete);
                } else {
                    setIsAutocompleteAvailable(false);
                }

                mapReadyRef.current = true;
                setMapStatus('ready');
                setError(null);

                if (initialCoordinates) {
                    setPinnedAddress('Finding pinned location...');
                    void reverseGeocode(initialCoordinates);
                }

                if (pendingLocation.current) {
                    const pending = pendingLocation.current;
                    window.clearTimeout(pending.timeoutId);
                    pendingLocation.current = null;
                    mapInstance.current.setCenter(pending.coordinates);
                    mapInstance.current.setZoom(16);
                    setPinnedCoordinates(pending.coordinates);
                    setPinnedAddress('Finding your location...');
                    void reverseGeocode(pending.coordinates);
                }
            })
            .catch(() => {
                if (
                    disposed ||
                    currentLifecycleId !== lifecycleId.current
                ) return;

                setMapStatus('error');
                setError('The map could not load. Please close this window and try again later.');
            });

        return () => {
            disposed = true;
            lifecycleId.current += 1;
            clearMapResources();
        };
    }, [
        clearMapResources,
        isManualMode,
        isOpen,
        reverseGeocode,
    ]);

    useEffect(() => () => {
        if (pendingLocation.current) {
            window.clearTimeout(pendingLocation.current.timeoutId);
            pendingLocation.current = null;
        }
    }, []);

    const queueOrApplyCoordinates = (coordinates: Coordinates) => {
        if (mapInstance.current && mapReadyRef.current) {
            mapInstance.current.setCenter(coordinates);
            mapInstance.current.setZoom(16);
            setPinnedCoordinates(coordinates);
            setPinnedAddress('Finding your location...');
            void reverseGeocode(coordinates);
            return;
        }

        if (pendingLocation.current) {
            window.clearTimeout(pendingLocation.current.timeoutId);
        }

        const timeoutId = window.setTimeout(() => {
            pendingLocation.current = null;
            if (isOpenRef.current) {
                setError('Your location was found, but the map did not become ready. Please close this window and try again later.');
            }
        }, MAP_READY_TIMEOUT_MS);
        pendingLocation.current = { coordinates, timeoutId };
        setError('Location found. Waiting for the map to finish loading...');
    };

    const handleUseCurrentLocation = () => {
        setError(null);
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (!isOpenRef.current) return;
                queueOrApplyCoordinates({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {
                if (isOpenRef.current) {
                    setError('Unable to retrieve your location. Please enable location services and try again.');
                }
            },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
    };

    const handleConfirm = () => {
        const address = deliveryAddress.trim();
        if (!address) {
            setAddressError('Complete delivery address is required.');
            completeAddressRef.current?.focus();
            return;
        }

        onSelect({
            address,
            coordinates: isManualMode || !isUsableCoordinates(pinnedCoordinates)
                ? null
                : pinnedCoordinates,
            source: isManualMode || !isUsableCoordinates(pinnedCoordinates) ? 'manual' : 'map',
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-start sm:items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="address-modal-title">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[700px] flex flex-col overflow-hidden">
                <header className="p-4 border-b flex items-center justify-between shrink-0">
                    <h2 id="address-modal-title" className="text-lg font-semibold text-primary">Set Delivery Location</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">
                        <X size={20} />
                    </button>
                </header>

                <div className="min-h-0 overflow-y-auto overscroll-contain">
                    {!isManualMode && googleMapsApiKey && (
                        <>
                            <div className="relative h-[34dvh] min-h-[210px] max-h-[340px] bg-gray-100">
                                {mapStatus === 'loading' && (
                                    <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-20">
                                        <div className="text-center text-gray-600">
                                            <LoaderCircle className="animate-spin text-primary mx-auto mb-2" size={32} />
                                            <p className="text-sm">Loading map...</p>
                                        </div>
                                    </div>
                                )}
                                {mapStatus === 'error' && (
                                    <div className="absolute inset-0 bg-red-50 flex flex-col items-center justify-center z-20 p-5 text-center">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                )}
                                <div ref={mapRef} className="w-full h-full" aria-label="Delivery area map" />
                                {mapStatus === 'ready' && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
                                        <MapPin size={40} className="text-primary drop-shadow-lg" />
                                    </div>
                                )}
                                {(mapStatus === 'loading' || mapStatus === 'ready') && (
                                    <button type="button" onClick={handleUseCurrentLocation} className="absolute bottom-4 right-4 z-30 p-3 bg-white rounded-full shadow-lg text-gray-700 hover:bg-gray-100" aria-label="Use current location">
                                        <LocateFixed size={20} />
                                    </button>
                                )}
                            </div>

                            <div className="p-4 bg-gray-50 border-t">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Search within 15 km of Cebu City
                                </label>
                                <div ref={autocompleteRef} className="min-h-[48px] mb-2" />
                                {mapStatus === 'ready' && !isAutocompleteAvailable && (
                                    <p className="text-xs text-gray-600 mb-2">
                                        Map search is unavailable. Drag the map or enter the complete address manually.
                                    </p>
                                )}
                                <p className="text-xs text-gray-600 min-h-[16px]">
                                    {pinnedAddress || 'Search above or drag the map to position the pin.'}
                                </p>
                                {error && mapStatus !== 'error' && (
                                    <p className="text-xs text-red-600 mt-2" role="status">{error}</p>
                                )}
                            </div>
                        </>
                    )}

                    {isManualMode && (
                        <div className="p-4 bg-blue-50 border-b border-blue-100">
                            <p className="text-sm font-medium text-gray-800">Manual address mode</p>
                            <p className="text-xs text-gray-600 mt-1">
                                The map is optional. Enter a complete delivery address below to continue.
                            </p>
                        </div>
                    )}

                    <div className="p-4 bg-gray-50 border-t">
                        <label htmlFor="complete-address" className="block text-sm font-medium text-gray-700 mb-1">
                            Complete delivery address <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            ref={completeAddressRef}
                            id="complete-address"
                            type="text"
                            value={deliveryAddress}
                            onChange={(event) => {
                                setDeliveryAddress(event.target.value);
                                if (addressError) setAddressError(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    handleConfirm();
                                }
                            }}
                            placeholder="Unit/building, street, barangay, city, and landmark"
                            aria-invalid={Boolean(addressError)}
                            aria-describedby={addressError ? 'complete-address-error' : undefined}
                            className={`w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal ${
                                addressError ? 'border-red-500' : 'border-primaryLight'
                            }`}
                        />
                        {addressError && (
                            <p id="complete-address-error" className="text-xs text-red-600 mt-1" role="alert">{addressError}</p>
                        )}

                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="w-full bg-primary text-white font-bold py-3 px-4 rounded-2xl hover:bg-opacity-90 transition-colors mt-4"
                        >
                            Confirm Address
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddressModal;
