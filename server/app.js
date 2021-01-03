// const cors = require('cors'); // optional if using cors enabled URLs
const express = require('@feathersjs/express');

const AppCore = require('./shared/server/core.js');

const services = require('./services');
const appHooks = require('./app.hooks');

const api = require('./api.js');

const authentication = require('./shared/server/authentication.js');
const channels = require('./channels');




// Create app from core library
const app = AppCore.createApp();

// Setup CORS enabled URLs
// app.use('/cors/*', cors());

// Host the public folder
// Statically host some files
// app.use('/', express.static(app.get('public')));

// Configure an initial middleware here
// app.configure(middleware(options));


// Configure middleware here
// app.configure(middleware(options));

// Configure feathers authentication
app.configure(authentication);

// Set up our services (see `services/index.js`)
app.configure(services);

// After `app.configure(services)`
app.configure(channels);

// Setup custom api
app.configure(api);

// Configure more middleware here
// app.configure(middleware(options));

// Configure a middleware for 404s and the error handler
app.use(express.notFound({ verbose: true }));
app.use(express.errorHandler());

// Setup app level hooks
app.hooks(appHooks);

module.exports = app;
