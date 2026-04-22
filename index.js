const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineSecret } = require("firebase-functions/params");

// Initialize Firebase Admin SDK
admin.initializeApp();

// const geminiApiKey = defineSecret("GEMINI_API_KEY"); // Removed in favor of string-based runWith secrets

exports.getPremiumRoute = functions.https.onCall(async (requestOrData, context) => {
    // 1. The "Bulletproof" Unwrapper
    const payload = requestOrData.data ? requestOrData.data : requestOrData;
    const coordinates = payload.coordinates;

    // 2. Input Handling & Smart Debugging
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        const debugString = payload ? JSON.stringify(payload).substring(0, 100) : "undefined";
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Payload mismatch! Received: " + debugString
        );
    }

    // 3. External API Call & Payload Construction
    const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

    // IMPORTANT: Make sure this is your BRAND NEW key if the old one was suspended!
    const hardcodedApiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ0YTM5ZTM2NTQ2NDRhNThhOWUxNDNjMmQyYTYzZDRkIiwiaCI6Im11cm11cjY0In0=";

    try {
        const response = await axios.post(url, {
            coordinates: coordinates
        }, {
            headers: {
                "Authorization": hardcodedApiKey,
                "Content-Type": "application/json",
                "Accept": "application/json, application/geo+json; charset=utf-8"
            }
        });

        // 4. Return Data
        console.log('ORS response data:', response.data);
        return response.data;
    } catch (error) {
        console.error("Networking/ORS Error:", error.response ? error.response.data : error.message);
        const message = error.response && error.response.data && error.response.data.error ? error.response.data.error.message : "Failed to calculate route from OpenRouteService.";
        throw new functions.https.HttpsError("internal", message);
    }
});

/**
 * Hourly Leaderboard Generator
 * Aggregates the top 100 users into a single document every hour to minimize frontend read costs.
 */
exports.generateHourlyLeaderboard = functions.pubsub.schedule("0 * * * *")
    .timeZone("America/New_York")
    .onRun(async (context) => {
        const db = admin.firestore();
        console.log("Starting hourly leaderboard generation...");

        try {
            // 1. Query the top users from the existing leaderboard collection
            const snapshot = await db.collection("leaderboard")
                .orderBy("totalVisited", "desc")
                .limit(100)
                .get();

            const leaderboardArray = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                leaderboardArray.push({
                    uid: doc.id,
                    displayName: data.displayName || "Anonymous Ranger",
                    totalVisited: data.totalVisited || 0,
                    hasVerified: !!data.hasVerified
                });
            });

            // 2. Save the entire array into ONE single document
            await db.collection("system").doc("leaderboardData").set({
                topUsers: leaderboardArray,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Leaderboard successfully updated with ${leaderboardArray.length} users.`);
            return null;
        } catch (error) {
            console.error("Error generating leaderboard:", error);
            return null;
        }
    });

/**
 * Data Refinery GenAI Extraction Endpoint
 */
exports.extractParkData = functions.runWith({ secrets: ["GEMINI_API_KEY"], memory: '1GB' }).https.onCall(async (requestOrData, context) => {
    // Support modular web SDK (data object wrapper)
    const payload = requestOrData.data ? requestOrData.data : requestOrData;

    if (!payload.image && !payload.text) {
        throw new functions.https.HttpsError("invalid-argument", "Missing image or text payload.");
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const prompt = "You are an expert data extraction parser for a National Park accessibility database. Analyze the provided Facebook screenshot or text block. Extract specific infrastructure and accessibility data and format it STRICTLY as a JSON object. If a data point is not mentioned, output null. Extraction Targets: parkName, entranceFee, swagLocation, approvedTrails, strictRules, hazards, extraSwag. Output ONLY valid JSON without markdown blocks.";

        let result;
        if (payload.image) {
            const imagePart = {
                inlineData: {
                    data: payload.image,
                    mimeType: payload.mimeType || 'image/jpeg'
                }
            };
            result = await model.generateContent([prompt, imagePart]);
        } else {
            result = await model.generateContent([prompt, payload.text]);
        }
        
        const response = result.response;
        let output = response.text() || "{}";
        
        // Failsafe strip markdown if present
        if (output.includes('```json')) {
            output = output.replace(/```json/g, '').replace(/```/g, '').trim();
        } else if (output.includes('```')) {
            output = output.replace(/```/g, '').trim();
        }

        console.log("AI RAW OUTPUT:", output);
        return JSON.parse(output);

    } catch (error) {
        console.error("GenAI Extraction Error:", error);
        throw new functions.https.HttpsError("internal", "Failed to parse data via GenAI.");
    }
});