const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    use: {
        serviceWorkers: 'block'
    }
});
