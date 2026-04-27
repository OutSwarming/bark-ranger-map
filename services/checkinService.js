/**
 * checkinService.js - GPS check-in validation and visit record construction.
 */
window.BARK = window.BARK || {};
window.BARK.services = window.BARK.services || {};

function getLocationCoords(userLocation) {
    const source = userLocation && userLocation.coords ? userLocation.coords : userLocation;
    if (!source) return null;

    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
}

function verifyAndProcessCheckin(parkData, userLocation, userVisitedPlaces) {
    const result = {
        success: false,
        distance: 0,
        visitRecord: null,
        error: null
    };

    try {
        const coords = getLocationCoords(userLocation);
        if (!coords) {
            result.error = 'INVALID_USER_LOCATION';
            return result;
        }

        if (!parkData) {
            result.error = 'MISSING_PARK_DATA';
            return result;
        }

        const parkLat = Number(parkData.lat);
        const parkLng = Number(parkData.lng);
        if (!Number.isFinite(parkLat) || !Number.isFinite(parkLng)) {
            result.error = 'INVALID_PARK_LOCATION';
            return result;
        }

        const haversine = window.BARK.utils && window.BARK.utils.geo && window.BARK.utils.geo.haversine;
        if (typeof haversine !== 'function') {
            result.error = 'GEO_UTIL_UNAVAILABLE';
            return result;
        }

        const radiusKm = window.BARK.config ? Number(window.BARK.config.CHECKIN_RADIUS_KM) : NaN;
        if (!Number.isFinite(radiusKm)) {
            result.error = 'CHECKIN_RADIUS_UNAVAILABLE';
            return result;
        }

        const distance = haversine(coords.latitude, coords.longitude, parkLat, parkLng);
        result.distance = distance;

        if (distance > radiusKm) {
            result.error = 'OUT_OF_RANGE';
            return result;
        }

        result.success = true;
        result.visitRecord = {
            id: parkData.id,
            name: parkData.name,
            lat: parkData.lat,
            lng: parkData.lng,
            verified: true,
            ts: Date.now()
        };
        return result;
    } catch (error) {
        console.error('[checkinService] verifyAndProcessCheckin failed:', error);
        result.error = 'CHECKIN_FAILED';
        return result;
    }
}

window.BARK.services.checkin = {
    verifyAndProcessCheckin
};
