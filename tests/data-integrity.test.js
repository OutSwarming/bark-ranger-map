const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const csvFiles = [
    {
        path: path.join(repoRoot, 'data', 'data.csv'),
        header: 'name,state,swagType,lat,lng,info,website'
    },
    {
        path: path.join(repoRoot, 'data', 'sheet_data_fetched.csv'),
        header: 'Location,State,Swag Cost,Type, Useful/Important/Other Info,Website,"Swag Pics - If available, and may not be current.",lat,lng'
    }
];

test('repo CSV data files do not contain unresolved git conflict markers', () => {
    for (const file of csvFiles) {
        const contents = fs.readFileSync(file.path, 'utf8');
        assert.doesNotMatch(contents, /^(<<<<<<<|=======|>>>>>>>) /m, `${file.path} contains conflict markers`);
    }
});

test('repo CSV data files keep their expected headers after conflict repair', () => {
    for (const file of csvFiles) {
        const firstLine = fs.readFileSync(file.path, 'utf8').split(/\r?\n/, 1)[0];
        assert.equal(firstLine, file.header, `${file.path} header changed unexpectedly`);
    }
});
