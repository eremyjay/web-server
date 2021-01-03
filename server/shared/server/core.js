// TODO: Add nodemon for usage in development mode

const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const configuration = require('@feathersjs/configuration');

const helmet = require('helmet');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const compression = require('compression');

const unique = require('../../shared/unique.js');
const logger = require('../../shared/server/logger.js');

var session = require('express-session');

var RedisStore = require('connect-redis')(session);
const mongoose = require('../../shared/server/mongoose.js');
const redisCache = require('feathers-redis-cache');

const bodyParserXML = require('../../middleware/body-parser-xml');

const setHeaders = require('../../middleware/set-headers');
const sanitizeRequest = require('../../middleware/sanitize-request');
const limiter = require('../../middleware/limiter');




module.exports = {
    createApp: createApp
}

function createApp() {
    // Create an Express compatible Feathers application
    const app = express(feathers());

    // Load app configuration
    app.configure(configuration());

    // Set app logger
    if (global.appLogger == null)
        global.appLogger = logger.init();

    logger.configure(global.appLogger, app);
    app.logger = global.appLogger;
    process.env.DEBUG = app.get('logger').debug;

    // Use GZIP compression
    app.use(compression());

    // Setup helmet to protect server
    app.use((req, res, next) => {
        res.locals.cspNonce = unique.generateHex();
        next();
    });

    app.use(helmet.contentSecurityPolicy({
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://connect.facebook.net", "https://checkout.stripe.com",  "https://www.paypal.com"],
            "worker-src": ["'self'", "blob:"],
            "connect-src": ["'self'", "https://www.google-analytics.com", "https://checkout.stripe.com", "https://www.paypal.com", "https://www.sandbox.paypal.com"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["https:", "data:"],
            "object-src": ["'self'"],
            "form-action": ["'self'", "https:"],
            "frame-src": ["'self'", "https://checkout.stripe.com", "https://www.paypal.com", "https://www.sandbox.paypal.com"],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "upgrade-insecure-requests": true
        }
    }));
    app.use(helmet.dnsPrefetchControl());
    app.use(helmet.expectCt());
    app.use(helmet.frameguard({
        action: "deny",
    }));
    app.use(helmet.hidePoweredBy());
    app.use(helmet.hsts());
    app.use(helmet.ieNoOpen());
    app.use(helmet.noSniff());
    app.use(helmet.permittedCrossDomainPolicies());
    app.use(helmet.referrerPolicy());
    app.use(helmet.xssFilter());


    // Initialize Redis
    if (app.get('features').redis) {
        app.redisStore = new Redis(app.get('redis'));

        app.redisStore.on('ready', function() {});
    }

    // Initialize Mongo
    if (app.get('features').mongo) {
        app.configure(mongoose);
    }


    // Add body parsing middleware
    app.use(express.json({limit: '10mb'}));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(bodyParser.text({type: '*/xml', limit: '10mb'}));
    app.use(bodyParserXML());

    // Set up Plugins and providers
    app.dynamicConnections = {};
    app.configure(express.rest());


    // Set template engine
    // app.set('view engine', 'pug');

    // Sessions config
    var sessionConfig = app.get('session');
    sessionConfig.store = new RedisStore({
        client: app.redisStore
    });

    if (app.get('env') === 'production') {
        app.set('trust proxy', 1); // trust first proxy
        sessionConfig.proxy = true;
    }

    // Use sessions
    app.expressSession = session(sessionConfig);
    app.use(app.expressSession);

    // Configure other middleware
    app.use(sanitizeRequest());
    app.configure(setHeaders);

    // Setup limiter to protect performance
    app.configure(limiter);


    // Caching for feathers services using redis
    if (app.get('cache').enabled) {
        app.configure(redisCache.client({errorLogger: logger.error}));
        app.configure(redisCache.services({pathPrefix: app.get('cache').path}));

        if (app.get('cache').logging) {
            process.env.ENABLE_REDIS_CACHE_LOGGER = true;
        }
    }


    return app;
}