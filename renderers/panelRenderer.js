/**
 * panelRenderer.js - Marker click panel rendering.
 * Phase 2 move-only extraction from dataService.js.
 */
window.BARK = window.BARK || {};

function renderMarkerClickPanel(context) {
    const marker = context.marker;
    const userVisitedPlaces = context.userVisitedPlaces;
    const syncUserProgress = context.syncUserProgress;
    const slidePanel = context.slidePanel;
    const titleEl = context.titleEl;
    const infoSection = context.infoSection;
    const infoEl = context.infoEl;
    const websitesContainer = context.websitesContainer;
    const picsEl = context.picsEl;
    const videoEl = context.videoEl;

    if (window.BARK.activePinMarker && window.BARK.activePinMarker._icon) {
        window.BARK.activePinMarker._icon.classList.remove('active-pin');
    }
    if (marker._icon) {
        marker._icon.classList.add('active-pin');
    }
    window.BARK.activePinMarker = marker;

    const panelScrollContainer = document.querySelector('.panel-content');
    if (panelScrollContainer) panelScrollContainer.scrollTop = 0;

    document.getElementById('filter-panel').classList.add('collapsed');

    const d = marker._parkData;
    if (titleEl) titleEl.textContent = d.name || 'Unknown Park';

    const metaContainer = document.getElementById('panel-meta-container');
    if (metaContainer) {
        metaContainer.innerHTML = `
            <div class="meta-pill">📍 ${d.state || 'N/A'}</div>
            <div class="meta-pill">🏷️ ${d.swagType}</div>
            <div class="meta-pill">💰 ${d.cost || 'Free'}</div>
        `;
    }

    const suggestEditBtn = document.getElementById('suggest-edit-btn');
    if (suggestEditBtn) {
        const subject = encodeURIComponent(`B.A.R.K. Map Edit: ${d.name}`);
        const body = encodeURIComponent(`Park Name: ${d.name}\nID: ${d.id}\n\n--- Please describe the update below ---\n`);
        suggestEditBtn.href = `mailto:usbarkrangers@gmail.com?subject=${subject}&body=${body}`;
    }

    // --- UPDATES & REPORTS ---
    if (d.info) {
        if (infoSection) infoSection.style.display = 'block';
        const container = document.getElementById('panel-info-container');
        const showMoreBtn = document.getElementById('show-more-info');
        if (infoEl) infoEl.innerHTML = d.info.replace(/\n/g, '<br>');

        const hasManyLines = (infoEl.innerHTML.match(/<br>/g) || []).length > 4;

        if (d.info.length > 250 || hasManyLines) {
            if (container) container.classList.add('report-collapsed');
            if (showMoreBtn) {
                showMoreBtn.style.display = 'block';
                showMoreBtn.onclick = () => {
                    container.classList.remove('report-collapsed');
                    showMoreBtn.style.display = 'none';
                };
            }
        } else {
            if (container) container.classList.remove('report-collapsed');
            if (showMoreBtn) showMoreBtn.style.display = 'none';
        }
    } else {
        if (infoSection) infoSection.style.display = 'none';
        if (infoEl) infoEl.innerHTML = '';
    }

    if (d.pics && typeof d.pics === 'string') {
        const formattedPics = window.BARK.formatSwagLinks(d.pics);
        if (formattedPics.includes('<a ')) {
            if (picsEl) { picsEl.style.display = 'grid'; picsEl.innerHTML = formattedPics; }
        } else {
            if (picsEl) picsEl.style.display = 'none';
        }
    } else {
        if (picsEl) picsEl.style.display = 'none';
    }

    if (d.video && typeof d.video === 'string' && d.video.startsWith('http')) {
        if (videoEl) { videoEl.style.display = 'block'; videoEl.href = d.video; }
    } else {
        if (videoEl) videoEl.style.display = 'none';
    }

    if (websitesContainer) {
        websitesContainer.innerHTML = '';
        if (d.website && typeof d.website === 'string') {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = d.website.match(urlRegex);
            if (urls && urls.length > 0) {
                websitesContainer.style.display = 'grid';
                urls.forEach((url, index) => {
                    const link = document.createElement('a');
                    link.href = url.replace(/['",]+$/, '');
                    link.target = '_blank';
                    link.className = 'website-btn';
                    link.textContent = urls.length > 1 ? `Website ${index + 1}` : 'Official Website';
                    websitesContainer.appendChild(link);
                });
            } else {
                websitesContainer.style.display = 'none';
            }
        } else {
            websitesContainer.style.display = 'none';
        }
    }

    // --- MAP URLS & BUTTON RENDERING ---
    const stickyFooter = document.getElementById('panel-sticky-footer');
    if (stickyFooter) {
        stickyFooter.style.display = 'grid';
        stickyFooter.innerHTML = `
            <a href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" class="dir-btn">🗺️ Google</a>
            <a href="http://maps.apple.com/?q=${encodeURIComponent(d.name)}&ll=${d.lat},${d.lng}" target="_blank" class="dir-btn">🧭 Apple</a>
            <button class="glass-btn btn-trip">➕ Add to Trip</button>
        `;

        const btnTrip = stickyFooter.querySelector('.btn-trip');
        if (btnTrip) {
            const tripDays = window.BARK.tripDays;
            const syncPopupUI = () => {
                const inTripDay = Array.from(tripDays).findIndex(day => day.stops.some(s => s.id === d.id));
                if (inTripDay > -1) {
                    btnTrip.innerHTML = `✓ In Trip (Day ${inTripDay + 1})`;
                    btnTrip.style.background = '#e8f5e9';
                    btnTrip.style.borderColor = '#4CAF50';
                    btnTrip.style.color = '#2E7D32';
                } else {
                    btnTrip.innerHTML = `➕ Add to Trip`;
                    btnTrip.style.background = '#fff';
                    btnTrip.style.borderColor = '#cbd5e1';
                    btnTrip.style.color = '#333';
                }
            };
            syncPopupUI();
            btnTrip.onclick = (e) => {
                e.preventDefault();
                if (window.addStopToTrip({ id: d.id, name: d.name, lat: d.lat, lng: d.lng })) {
                    syncPopupUI();
                }
            };
        }
    }

    // --- VISITED SECTION ---
    const visitedSection = document.getElementById('panel-visited-section');
    const markVisitedBtn = document.getElementById('mark-visited-btn');
    const markVisitedText = document.getElementById('mark-visited-text');
    const verifyBtn = document.getElementById('verify-checkin-btn');
    const verifyBtnText = document.getElementById('verify-checkin-text');

    if (visitedSection && markVisitedBtn && markVisitedText && verifyBtn) {
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            visitedSection.style.display = 'block';

            if (userVisitedPlaces.has(d.id)) {
                const cachedObj = userVisitedPlaces.get(d.id);

                markVisitedBtn.classList.add('visited');
                markVisitedText.textContent = '✓ Visited';

                if (cachedObj.verified) {
                    markVisitedBtn.disabled = true;
                    markVisitedBtn.style.cursor = 'default';
                    markVisitedBtn.style.opacity = '0.7';
                } else {
                    markVisitedBtn.disabled = false;
                    markVisitedBtn.style.cursor = 'pointer';
                    markVisitedBtn.style.opacity = '1';
                }

                if (window.allowUncheck && !cachedObj.verified) {
                    markVisitedBtn.style.background = '#4CAF50';
                    markVisitedBtn.onmouseenter = () => markVisitedText.textContent = '✖ Remove Check-in';
                    markVisitedBtn.onmouseleave = () => markVisitedText.textContent = '✓ Visited';
                } else {
                    markVisitedBtn.onmouseenter = null;
                    markVisitedBtn.onmouseleave = null;
                }

                if (cachedObj.verified) {
                    verifyBtn.style.background = '#4CAF50';
                    verifyBtnText.textContent = '🐾 Verified & Secured';
                    verifyBtn.disabled = true;
                    verifyBtn.style.cursor = 'default';
                    verifyBtn.style.opacity = '0.7';
                } else {
                    verifyBtn.style.background = '#FF9800';
                    verifyBtnText.textContent = '🐾 Verified Check-In';
                    verifyBtn.disabled = false;
                    verifyBtn.style.cursor = 'pointer';
                    verifyBtn.style.opacity = '1';
                }
            } else {
                markVisitedBtn.classList.remove('visited');
                markVisitedText.textContent = 'Mark as Visited';
                markVisitedBtn.disabled = false;
                markVisitedBtn.style.cursor = 'pointer';
                markVisitedBtn.style.opacity = '1';
                markVisitedBtn.onmouseenter = null;
                markVisitedBtn.onmouseleave = null;

                verifyBtn.style.background = '#FF9800';
                verifyBtnText.textContent = '🐾 Verified Check-In';
                verifyBtn.disabled = false;
                verifyBtn.style.cursor = 'pointer';
                verifyBtn.style.opacity = '1';
            }

            verifyBtn.onclick = () => {
                if (!navigator.geolocation) { alert("Geolocation is not supported by your browser."); return; }
                verifyBtnText.textContent = 'Locating...';

                navigator.geolocation.getCurrentPosition((position) => {
                    const dist = window.BARK.haversineDistance(position.coords.latitude, position.coords.longitude, d.lat, d.lng);
                    if (dist <= 25) {
                        alert(`Check-in Verified! You earned 2 points.`);
                        const newObj = { id: d.id, name: d.name, lat: d.lat, lng: d.lng, verified: true, ts: Date.now() };

                        window.BARK.incrementRequestCount();
                        const docRef = firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid);

                        userVisitedPlaces.set(d.id, newObj);
                        const updatedArray = Array.from(userVisitedPlaces.values());
                        docRef.update({ visitedPlaces: updatedArray });

                        verifyBtn.style.background = '#4CAF50';
                        verifyBtnText.textContent = '🐾 Verified & Secured';
                        verifyBtn.disabled = true;
                        verifyBtn.style.cursor = 'default';
                        verifyBtn.style.opacity = '0.7';

                        markVisitedBtn.classList.add('visited');
                        markVisitedText.textContent = '✓ Visited';
                        markVisitedBtn.disabled = true;
                        markVisitedBtn.style.cursor = 'default';
                        markVisitedBtn.style.opacity = '0.7';

                        window.syncState();
                        window.BARK.updateStatsUI();
                        window.attemptDailyStreakIncrement();
                    } else {
                        alert(`Out of Range! You are ${dist.toFixed(1)} km away. You must be within 25 km to verify.`);
                        verifyBtnText.textContent = '🐾 Verified Check-In';
                    }
                }, (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                        alert("Location permission denied. GPS is required for verified check-ins.");
                    } else {
                        alert("Failed to get location. Try again later.");
                    }
                    verifyBtnText.textContent = '🐾 Verified Check-In';
                }, { enableHighAccuracy: true });
            };

            markVisitedBtn.onclick = async () => {
                if (userVisitedPlaces.has(d.id)) {
                    const cachedObj = userVisitedPlaces.get(d.id);
                    if (cachedObj.verified) return;

                    if (!window.allowUncheck) {
                        alert("🛡️ Data Safety Lock Active\n\nTo prevent you from accidentally losing your 'Date Visited' history, unchecking parks is disabled by default.\n\nYou can turn off this safety feature by opening Settings (⚙️) and enabling 'Allow Uncheck Visited'.");
                        return;
                    }

                    userVisitedPlaces.delete(d.id);
                    markVisitedBtn.classList.remove('visited');
                    markVisitedText.textContent = 'Mark as Visited';
                    markVisitedBtn.onmouseenter = null;
                    markVisitedBtn.onmouseleave = null;

                    const updatedArray = Array.from(userVisitedPlaces.values());
                    await firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid).update({ visitedPlaces: updatedArray });

                    window.syncState();
                    return;
                }

                const newObj = { id: d.id, name: d.name, lat: d.lat, lng: d.lng, verified: false, ts: Date.now() };
                userVisitedPlaces.set(d.id, newObj);

                markVisitedBtn.classList.add('visited');
                markVisitedText.textContent = '✓ Visited';
                markVisitedBtn.disabled = false;
                markVisitedBtn.style.cursor = 'pointer';
                markVisitedBtn.style.opacity = '1';

                await syncUserProgress();
                window.syncState();
                window.attemptDailyStreakIncrement();
            };
        } else {
            visitedSection.style.display = 'none';
        }
    }

    // --- SMART AUTO-PAN ---
    if (!window.stopAutoMovements) {
        const currentZoom = map.getZoom();
        const xOffset = window.innerWidth >= 768 ? -250 : 0;
        const yOffset = window.innerWidth < 768 ? 180 : 0;
        const targetPoint = map.project([d.lat, d.lng], currentZoom).add([xOffset, yOffset]);
        const targetLatLng = map.unproject(targetPoint, currentZoom);

        map.panTo(targetLatLng, {
            animate: !window.instantNav,
            duration: window.instantNav ? 0 : 0.5
        });
    }

    if (slidePanel) slidePanel.classList.add('open');
}

window.BARK.renderMarkerClickPanel = renderMarkerClickPanel;
