// Initializes the `servers` service on path `/servers`
const { Servers } = require('./servers.class');
const createModel = require('../../models/servers.model');
const hooks = require('./servers.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/servers', new Servers(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('servers');

  (hooks.constructor === Function) ? service.hooks(hooks(app)) : service.hooks(hooks);
};
