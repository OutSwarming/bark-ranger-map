/**
 * markerLayerPolicy.js - Single source of truth for marker layer/performance mode.
 */
window.BARK = window.BARK || {};

function getMarkerLayerPolicy(zoom) {
    const currentZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : (window.map ? window.map.getZoom() : 0);
    const premiumExplodesAtZoom = window.premiumClusteringEnabled && currentZoom >= 7;
    const canCluster = window.clusteringEnabled && !window.forcePlainMarkers && !premiumExplodesAtZoom;

    return {
        layerType: canCluster ? 'cluster' : 'plain',
        freezeDuringZoom: Boolean(window.stopResizing),
        cullPlainMarkers: Boolean(window.viewportCulling || window.forcePlainMarkers),
        useReducedVisualsDuringMotion: Boolean(window.stopResizing || window.lowGfxEnabled || window.ultraLowEnabled)
    };
}

window.BARK.getMarkerLayerPolicy = getMarkerLayerPolicy;
