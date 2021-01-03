const appLogger = global.appLogger || require('winston').createLogger();

// Core functions
const command = require('./api/command/command.js');
const receivers = require('./services/receivers.js');

// Import non-feathers APIs here
// const api = require('/api/api.js');


module.exports = function () {
    const app = this; // eslint-disable-line no-unused-vars

    // Command and control
    app.configure(command(receivers));

    // app.configure your APIs here
    // app.configure(api);
};
