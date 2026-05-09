const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function parseSimpleCsv(csvString, options) {
    const lines = csvString.trim().split(/\r?\n/);
    const headers = lines[0]
        .split(',')
        .map(header => options.transformHeader ? options.transformHeader(header) : header);
    const data = lines.slice(1).map(line => {
        const values = line.split(',').map(value => options.transform ? options.transform(value) : value);
        return headers.reduce((row, header, index) => {
            row[header] = values[index] || '';
            return row;
        }, {});
    });
    options.complete({ data, errors: [] });
}

test('data service repairs known published rows with missing coordinates before publishing parks', () => {
    let publishedPoints = null;
    let gamificationPoints = null;
    const sandbox = {
        console,
        fetch,
        setTimeout,
        clearTimeout,
        navigator: { onLine: true },
        localStorage: {
            getItem() { return null; },
            setItem() {}
        },
        Papa: {
            parse: parseSimpleCsv
        },
        window: {
            BARK: {
                debugDataRefresh: false,
                getSwagType() { return 'Other'; },
                getParkCategory(value) { return value || 'Unknown'; },
                normalizeText(value) { return String(value || '').trim().toLowerCase(); },
                repos: {
                    ParkRepo: {
                        replaceAll(points) {
                            publishedPoints = points;
                            return { accepted: true };
                        }
                    }
                }
            },
            gamificationEngine: {
                updateCanonicalCountsFromPoints(points) {
                    gamificationPoints = points;
                }
            },
            syncState() {}
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'modules', 'dataService.js'), 'utf8'), sandbox);

    sandbox.window.BARK.parseCSVString([
        'Location,State,Swag Cost,Type,Useful/Important/Other Info,Website,lat,lng,Park id',
        'Cliffs of the Neuse State Park,North Carolina,Unknown,State,Tag,https://www.ncparks.gov/state-parks/cliffs-neuse-state-park,,,38e0a9bb-4365-4d84-87ea-cca3bde06435'
    ].join('\n'));

    assert.equal(publishedPoints.length, 1);
    assert.equal(gamificationPoints, publishedPoints);
    assert.equal(publishedPoints[0].id, '38e0a9bb-4365-4d84-87ea-cca3bde06435');
    assert.equal(publishedPoints[0].lat, 35.2354);
    assert.equal(publishedPoints[0].lng, -77.8932);
});
