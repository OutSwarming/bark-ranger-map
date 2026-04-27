/**
 * searchEngine.js — Search Bar, Fuzzy Matching, Suggestions, Geocoder
 * Owns normalizeText(), levenshtein(), search event listeners, and executeGeocode().
 * Loaded FIFTH in the boot sequence.
 */
window.BARK = window.BARK || {};

// ====== TEXT NORMALIZATION ======
function normalizeText(text) {
    if (!text) return '';
    const dict = window.BARK.normalizationDict;
    let cleaned = String(text).toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ").trim();
    let words = cleaned.split(' ');
    for (let i = 0; i < words.length; i++) {
        if (dict[words[i]]) {
            words[i] = dict[words[i]];
        }
    }
    return words.join(' ');
}

// ====== O(1) LEVENSHTEIN ======
function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length > b.length) [a, b] = [b, a];
    let row = new Array(a.length + 1);
    for (let i = 0; i <= a.length; i++) row[i] = i;
    for (let i = 1; i <= b.length; i++) {
        let prev = i;
        for (let j = 1; j <= a.length; j++) {
            let val = (b[i - 1] === a[j - 1]) ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
            row[j - 1] = prev;
            prev = val;
        }
        row[a.length] = prev;
    }
    return row[a.length];
}

window.BARK.normalizeText = normalizeText;
window.BARK.levenshtein = levenshtein;

// ====== SEARCH UI BINDING ======
function initSearchEngine() {
    const searchInput = document.getElementById('park-search');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const searchSuggestions = document.getElementById('search-suggestions');
    const typeSelect = document.getElementById('type-filter');
    const filterBtns = document.querySelectorAll('.filter-btn');
    let searchTimeout = null;

    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        window.BARK.activeSearchQuery = e.target.value;

        if (clearSearchBtn) {
            clearSearchBtn.style.display = window.BARK.activeSearchQuery.length > 0 ? 'block' : 'none';
        }

        if (searchTimeout) clearTimeout(searchTimeout);

        if (window.BARK.activeSearchQuery.trim() === '') {
            if (searchSuggestions) searchSuggestions.style.display = 'none';
            window.syncState();
            return;
        }

        searchTimeout = setTimeout(() => {
            const queryNorm = normalizeText(window.BARK.activeSearchQuery);
            const allPoints = window.BARK.allPoints;

            // 🔥 FIRST PASS: Build the cache (this runs Levenshtein once)
            const matchedIds = new Set();
            let matches = [];

            allPoints.forEach(item => {
                const nameNorm = item._cachedNormalizedName;
                let score = 999;
                if (nameNorm.includes(queryNorm)) {
                    score = 0;
                } else if (queryNorm.length > 2) {
                    let minDist = levenshtein(queryNorm, nameNorm);
                    const words = nameNorm.split(' ');
                    for (let i = 0; i < words.length; i++) {
                        if (minDist <= 1) break;
                        const word = words[i];
                        if (Math.abs(queryNorm.length - word.length) < 5) {
                            minDist = Math.min(minDist, levenshtein(queryNorm, word));
                        }
                    }
                    score = minDist;
                }
                if (score <= 2) {
                    matchedIds.add(item.id);
                    matches.push({ item: item, score: score });
                }
            });
            window.BARK._searchResultCache = { query: queryNorm, matchedIds };

            // 🆕 SECOND PASS: Use the cache — no duplicate Levenshtein needed
            const cachedIds = window.BARK._searchResultCache.matchedIds;
            const suggestions = allPoints.filter(p => cachedIds.has(p.id));

            suggestions.sort((a, b) => a.name.localeCompare(b.name));
            const topMatches = suggestions.slice(0, 8);

            searchSuggestions.innerHTML = '';

            // 1. Render local map matches
            if (topMatches.length > 0) {
                topMatches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = match.name + (match.state ? `, ${match.state}` : '');
                    div.addEventListener('click', () => {
                        searchInput.value = match.name;
                        window.BARK.activeSearchQuery = match.name;
                        searchSuggestions.style.display = 'none';
                        window.syncState();

                        if (match.marker && match.marker._parkData) {
                            if (!window.stopAutoMovements) {
                                map.setView([match.marker._parkData.lat, match.marker._parkData.lng], 12, {
                                    animate: !window.lowGfxEnabled,
                                    duration: window.lowGfxEnabled ? 0 : 1.5
                                });
                            }
                            match.marker.fire('click');
                        }
                    });
                    searchSuggestions.appendChild(div);
                });
            }

            // 2. BLENDED FALLBACK: Always offer global search if query is > 2 chars
            if (window.BARK.activeSearchQuery.trim().length > 2) {
                const isPremium = (typeof firebase !== 'undefined' && firebase.auth().currentUser !== null);

                if (topMatches.length === 0 && isPremium) {
                    const statusDiv = document.createElement('div');
                    statusDiv.className = 'suggestion-item';
                    statusDiv.style.cssText = 'background: #fdf4ff; color: #c026d3; font-weight: 700; border-top: 1px solid #f0abfc;';
                    statusDiv.innerHTML = `🔍 Searching for "${window.BARK.activeSearchQuery}"...`;
                    searchSuggestions.appendChild(statusDiv);
                    executeGeocode(window.BARK.activeSearchQuery, 'stop');
                } else {
                    const federatedBtn = document.createElement('div');
                    federatedBtn.className = 'suggestion-item';
                    federatedBtn.style.cssText = 'background: #f0fdf4; color: #15803d; font-weight: 700; border-top: 1px solid #bbf7d0; display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 4px;';
                    federatedBtn.innerHTML = `🌍 <div>Search towns & cities for "${window.BARK.activeSearchQuery}"<br><span style="font-size:10px; font-weight:normal; color:#166534;">Query global database</span></div>`;

                    federatedBtn.addEventListener('click', () => {
                        if (!isPremium) {
                            alert('Searching for custom towns and locations is a Premium feature. Please log in via the Profile tab.');
                            return;
                        }
                        const queryToFetch = window.BARK.activeSearchQuery;
                        searchInput.value = `Searching for "${queryToFetch}"...`;
                        searchSuggestions.style.display = 'none';
                        executeGeocode(queryToFetch, 'stop');
                    });

                    if (!isPremium) {
                        federatedBtn.style.opacity = '0.7';
                        federatedBtn.innerHTML = `🔒 <div style="color:#64748b;">Search global towns for "${window.BARK.activeSearchQuery}"<br><span style="font-size:10px; font-weight:normal;">Sign in to unlock global routing</span></div>`;
                    }

                    searchSuggestions.appendChild(federatedBtn);
                }
            }

            if (searchSuggestions.innerHTML !== '') {
                searchSuggestions.style.display = 'block';
            } else {
                searchSuggestions.style.display = 'none';
            }

            window.syncState();
        }, 300);
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (searchSuggestions && searchSuggestions.style.display === 'block') {
            if (!searchSuggestions.contains(e.target) && e.target !== searchInput) {
                searchSuggestions.style.display = 'none';
            }
        }
    });

    // Reshow dropdown when focusing search bar
    searchInput.addEventListener('focus', () => {
        if (searchSuggestions && searchSuggestions.innerHTML.trim() !== '' && window.BARK.activeSearchQuery.length > 0) {
            searchSuggestions.style.display = 'block';
        }
    });

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            window.BARK.activeSearchQuery = '';
            clearSearchBtn.style.display = 'none';
            if (searchSuggestions) searchSuggestions.style.display = 'none';
            window.syncState();
            searchInput.focus();
        });
    }

    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            window.BARK.activeTypeFilter = e.target.value;
            window.syncState();
        });
    }

    // ====== FILTER BUTTONS ======
    filterBtns.forEach(btn => {
        // Skip the Virtual Trail and Completed Trails buttons — they are handled by expeditionEngine
        const filterType = btn.getAttribute('data-filter');
        if (filterType === 'VirtualTrail' || filterType === 'CompletedTrails') return;

        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-filter');

            if (window.BARK.activeSwagFilters.size === 0) {
                window.BARK.activeSwagFilters.add(type);
                btn.classList.add('active');
            } else {
                if (window.BARK.activeSwagFilters.has(type)) {
                    window.BARK.activeSwagFilters.delete(type);
                    btn.classList.remove('active');
                } else {
                    window.BARK.activeSwagFilters.add(type);
                    btn.classList.add('active');
                }
            }

            if (window.BARK.activeSwagFilters.size === 0) {
                filterBtns.forEach(b => b.classList.remove('active'));
            }

            window.syncState();
        });
    });
}

window.BARK.initSearchEngine = initSearchEngine;

// ====== UNIVERSAL GEOCODER ======
async function executeGeocode(query, targetType) {
    if (!query) return;
    const lowerQ = query.trim().toLowerCase();
    const incrementRequestCount = window.BARK.incrementRequestCount;

    // 🔥 SMART INTERCEPT: GPS Routing
    if (lowerQ === 'my location' || lowerQ === 'current location') {
        const mainSearch = document.getElementById('park-search');
        if (targetType === 'stop' && mainSearch) mainSearch.value = 'Locating GPS...';
        else {
            const inlineInput = document.getElementById(`inline-${targetType}-input`);
            if (inlineInput) inlineInput.value = 'Locating GPS...';
        }

        navigator.geolocation.getCurrentPosition((pos) => {
            const node = { name: "My Current Location", lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (targetType === 'start') window.tripStartNode = node;
            else if (targetType === 'end') window.tripEndNode = node;
            else window.addStopToTrip(node);

            if (targetType === 'stop' && mainSearch) {
                mainSearch.value = '';
                window.BARK.activeSearchQuery = '';
            }
            if (typeof window.BARK.updateTripUI === 'function') window.BARK.updateTripUI();
        }, () => {
            alert("Could not get GPS location. Please check browser permissions.");
            if (targetType === 'stop' && mainSearch) mainSearch.value = '';
        }, { enableHighAccuracy: true });
        return;
    }

    // Standard API Search
    try {
        window.BARK.incrementRequestCount();
        const hardcodedApiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ0YTM5ZTM2NTQ2NDRhNThhOWUxNDNjMmQyYTYzZDRkIiwiaCI6Im11cm11cjY0In0=";
        const url = `https://api.openrouteservice.org/geocode/search?api_key=${hardcodedApiKey}&text=${encodeURIComponent(query)}&size=5&boundary.country=US`;

        const response = await fetch(url);
        const data = await response.json();

        const disambiguationContainer = (targetType === 'stop')
            ? document.getElementById('search-suggestions')
            : document.getElementById(targetType === 'start' ? 'inline-suggest-start' : 'inline-suggest-end');

        if (data.features && data.features.length > 0) {
            if (data.features.length === 1) {
                const coords = data.features[0].geometry.coordinates;
                const node = { name: data.features[0].properties.label || query, lat: coords[1], lng: coords[0] };
                if (targetType === 'start') window.tripStartNode = node;
                else if (targetType === 'end') window.tripEndNode = node;
                else window.addStopToTrip(node);

                const mainSearch = document.getElementById('park-search');
                const clearBtn = document.getElementById('clear-search-btn');

                if (mainSearch) mainSearch.value = '';
                if (typeof window.BARK.activeSearchQuery !== 'undefined') window.BARK.activeSearchQuery = '';
                if (clearBtn) clearBtn.style.display = 'none';

                window.syncState();

                if (typeof map !== 'undefined' && !window.stopAutoMovements) {
                    map.setView([node.lat, node.lng], 10, {
                        animate: !window.instantNav,
                        duration: window.instantNav ? 0 : 0.4
                    });
                }

                if (typeof window.BARK.updateTripUI === 'function') window.BARK.updateTripUI();
            } else {
                if (disambiguationContainer) {
                    let actionText = targetType === 'start' ? '🟢 TRIP START' : (targetType === 'end' ? '🔴 TRIP END' : '➕ ADD STOP');
                    disambiguationContainer.innerHTML = `
                        <div style="background: #f0fdf4; border-bottom: 1px solid #bbf7d0; padding: 10px; font-size: 11px; color: #15803d; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; gap: 8px;">
                            📍 SELECT FOR ${actionText}
                        </div>`;

                    data.features.forEach(f => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style.cssText = 'padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;';
                        div.innerHTML = `<span style="font-weight: 700; color: #1e293b;">${f.properties.label}</span>`;

                        div.onclick = () => {
                            const coords = f.geometry.coordinates;
                            const node = { name: f.properties.label, lat: coords[1], lng: coords[0] };
                            if (targetType === 'start') window.tripStartNode = node;
                            else if (targetType === 'end') window.tripEndNode = node;
                            else window.addStopToTrip(node);

                            const mainSearch = document.getElementById('park-search');
                            const clearBtn = document.getElementById('clear-search-btn');

                            if (mainSearch) mainSearch.value = '';
                            if (typeof window.BARK.activeSearchQuery !== 'undefined') window.BARK.activeSearchQuery = '';
                            if (clearBtn) clearBtn.style.display = 'none';

                            window.syncState();

                            if (typeof map !== 'undefined' && !window.stopAutoMovements) {
                                map.setView([node.lat, node.lng], 10, {
                                    animate: !window.lowGfxEnabled,
                                    duration: window.lowGfxEnabled ? 0 : 1.5
                                });
                            }

                            disambiguationContainer.style.display = 'none';
                            if (typeof window.BARK.updateTripUI === 'function') window.BARK.updateTripUI();
                        };
                        disambiguationContainer.appendChild(div);
                    });

                    disambiguationContainer.style.display = 'block';
                }
            }
        } else {
            if (disambiguationContainer) {
                disambiguationContainer.innerHTML = `<p style="padding: 10px; font-size: 12px; color: #dc2626; text-align: center; font-weight: bold;">Location not found.</p>`;
            }
        }
    } catch (err) {
        alert("Search service unavailable.");
    }
}

window.BARK.executeGeocode = executeGeocode;
// Also expose on window for inline HTML handlers
window.processInlineSearch = function (type) {
    const input = document.getElementById(`inline-${type}-input`);
    if (input && input.value.trim() !== '') {
        const suggestBox = document.getElementById(`inline-suggest-${type}`);
        if (suggestBox) {
            suggestBox.style.display = 'block';
            suggestBox.innerHTML = '<p style="padding: 10px; font-size: 12px; color: #666; text-align: center;">Searching...</p>';
        }
        executeGeocode(input.value.trim(), type);
    }
};
