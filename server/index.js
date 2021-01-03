const path = require('path');
global.appRoot = path.resolve(__dirname);

process.env.NODE_CONFIG_DIR = './config/';

global.appLogger = require('./shared/server/logger.js').init();
const app = require('./app');

const server = require('./shared/server/server.js');
const managers = require('./services/managers.js');
const handlers = require('./services/handlers.js');

server.runServer(app, managers, handlers);
