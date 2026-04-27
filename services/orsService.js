/**
 * orsService.js - OpenRouteService transport boundary.
 */
(function () {
    window.BARK = window.BARK || {};
    window.BARK.services = window.BARK.services || {};

    const GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';
    const DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

    function getApiKey() {
        const apiKey = window.BARK.config && window.BARK.config.ORS_API_KEY;
        if (!apiKey) {
            throw new Error('Missing ORS API key in window.BARK.config.ORS_API_KEY.');
        }
        return apiKey;
    }

    async function parseJsonResponse(response) {
        let data = null;

        try {
            data = await response.json();
        } catch (error) {
            if (!response.ok) {
                throw new Error(`ORS request failed with status ${response.status}.`);
            }
            throw error;
        }

        if (!response.ok) {
            throw new Error(data?.error?.message || data?.message || `ORS request failed with status ${response.status}.`);
        }

        return data;
    }

    async function geocode(query, options = {}) {
        try {
            const params = new URLSearchParams({
                api_key: getApiKey(),
                text: query,
                size: String(options.size || 5)
            });

            if (options.country) {
                params.set('boundary.country', options.country);
            }

            const response = await fetch(`${GEOCODE_URL}?${params.toString()}`);
            return await parseJsonResponse(response);
        } catch (error) {
            console.error('ORS geocode request failed.', error);
            throw error;
        }
    }

    async function directions(coordinates, options = {}) {
        try {
            const radiuses = options.radiuses || new Array(coordinates.length).fill(-1);
            const response = await fetch(DIRECTIONS_URL, {
                method: 'POST',
                headers: {
                    Authorization: getApiKey(),
                    'Content-Type': 'application/json',
                    Accept: 'application/json, application/geo+json; charset=utf-8'
                },
                body: JSON.stringify({ coordinates, radiuses })
            });

            return await parseJsonResponse(response);
        } catch (error) {
            console.error('ORS directions request failed.', error);
            throw error;
        }
    }

    window.BARK.services.ors = {
        geocode,
        directions
    };
})();
