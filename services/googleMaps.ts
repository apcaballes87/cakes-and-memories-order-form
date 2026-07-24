import { Loader } from '@googlemaps/js-api-loader';

export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export interface GoogleMapsLibraries {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => any;
    Geocoder: new () => any;
    PlaceAutocompleteElement?: new (options?: Record<string, unknown>) => HTMLElement;
}

let librariesPromise: Promise<GoogleMapsLibraries> | null = null;

export const loadGoogleMapsLibraries = (): Promise<GoogleMapsLibraries> => {
    if (!googleMapsApiKey) {
        return Promise.reject(new Error('Google Maps is not configured.'));
    }

    if (!librariesPromise) {
        const loader = new Loader({
            apiKey: googleMapsApiKey,
            version: 'weekly',
        });

        librariesPromise = Promise.all([
            loader.importLibrary('maps'),
            loader.importLibrary('places'),
            loader.importLibrary('geocoding'),
        ])
            .then(([mapsLibrary, placesLibrary, geocodingLibrary]) => ({
                Map: (mapsLibrary as any).Map,
                Geocoder: (geocodingLibrary as any).Geocoder,
                PlaceAutocompleteElement: (placesLibrary as any).PlaceAutocompleteElement,
            }))
            .catch((error) => {
                // Permit a user-initiated retry after a transient script or network failure.
                librariesPromise = null;
                throw error;
            });
    }

    return librariesPromise;
};
