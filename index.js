const profileService = require('./profileService');
const service = require('./service');
const { createRouter } = require('./router');

module.exports = {
    profileService,
    service,
    createRouter,
};
