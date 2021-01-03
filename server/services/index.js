const appLogger = global.appLogger || require('winston').createLogger();

const servers = require('../services/servers/servers.service.js');
const users = require('../services/users/users.service.js');

// Import feathers services here
// const users = require('users.service.js');


module.exports = function () {
  const app = this;

  app.configure(servers);
  app.configure(users);

  // app.configure feathers services here
  // app.configure(service);

};
