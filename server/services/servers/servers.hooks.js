const { authenticate } = require('@feathersjs/authentication').hooks;

const dataAuthorization = require('../../hooks/authorization/authorization.js');
const authorizer = require('./servers.authorization.js');

const cacheBefore = require('feathers-redis-cache').hooks.before;
const cacheAfter = require('feathers-redis-cache').hooks.after;
const cachePurge = require('feathers-redis-cache').hooks.purge;


module.exports = function(app) {
  const expiry = app.get('cache').expiry;

  return {
    before: {
      all: [ authenticate('jwt'), dataAuthorization(authorizer) ],
      find: [ cacheBefore() ],
      get: [ cacheBefore() ],
      create: [],
      update: [],
      patch: [],
      remove: []
    },

    after: {
      all: [ dataAuthorization(authorizer) ],
      find: [ cacheAfter({ expiration: expiry }) ],
      get: [ cacheAfter({ expiration: expiry }) ],
      create: [ cachePurge() ],
      update: [ cachePurge() ],
      patch: [ cachePurge() ],
      remove: [ cachePurge() ]
    },

    error: {
      all: [],
      find: [],
      get: [],
      create: [],
      update: [],
      patch: [],
      remove: []
    }
  };
};
