const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialize Firebase Admin SDK
admin.initializeApp();

exports.getPremiumRoute = functions.https.onCall(async (requestOrData, context) => {
    // 1. The "Bulletproof" Unwrapper
    // This safely extracts the payload whether Firebase wrapped it in a v1 or v2 structure.
    const payload = requestOrData.data ? requestOrData.data : requestOrData;
    const coordinates = payload.coordinates;

    // 2. Input Handling & Smart Debugging
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        // If it fails, this pushes the EXACT data shape to your frontend popup!
        const debugString = payload ? JSON.stringify(payload).substring(0, 100) : "undefined";
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Payload mismatch! Received: " + debugString
        );
    }

    // 3. External API Call & Payload Construction
    const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
    const hardcodedApiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ0YTM5ZTM2NTQ2NDRhNThhOWUxNDNjMmQyYTYzZDRkIiwiaCI6Im11cm11cjY0In0=";

    try {
        const response = await axios.post(url, {
            coordinates: coordinates
        }, {
            headers: {
                "Authorization": `ors-api-key ${hardcodedApiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json, application/geo+json; charset=utf-8"
            }
        });

        // 4. Return Data
        console.log('ORS response data:', response.data);
        return response.data;
    } catch (error) {
        console.error("Networking/ORS Error:", error.response ? error.response.data : error.message);
        // Propagate the ORS error message to the client for better debugging
        const message = error.response && error.response.data && error.response.data.error ? error.response.data.error.message : "Failed to calculate route from OpenRouteService.";
        throw new functions.https.HttpsError("internal", message);
    }
});