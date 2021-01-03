const { authenticate } = require('@feathersjs/authentication').hooks;
const { hashPassword, protect } = require('@feathersjs/authentication-local').hooks;





const initUser = require('../../hooks/init-user');
const generateToken = require('../../hooks/generate-token');

const dataAuthorization = require('../../hooks/authorization/authorization.js');
const authorizer = require('./users.authorization.js');

const cacheBefore = require('feathers-redis-cache').hooks.before;
const cacheAfter = require('feathers-redis-cache').hooks.after;
const cachePurge = require('feathers-redis-cache').hooks.purge;


module.exports = function(app) {
  const expiry = app.get('cache').expiry;

  return {
    before: {
      all: [ dataAuthorization(authorizer) ],
      find: [ cacheBefore() ],
      get: [ cacheBefore() ],
      create: [ hashPassword('password'), initUser(), generateToken() ],
      update: [ hashPassword('password') ],
      patch: [ hashPassword('password'), generateToken() ],
      remove: []
    },

    after: {
      all: [ protect('password'), dataAuthorization(authorizer) ],
      find: [ cacheAfter({ expiration: expiry }) ],
      get: [ cacheAfter({ expiration: expiry }) ],
      create: [  cachePurge() ],
      update: [ cachePurge() ],
      patch: [   cachePurge() ],
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
