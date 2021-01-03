// Application hooks that run for every service
const { protect } = require('@feathersjs/authentication-local').hooks;

const logger = require('./hooks/logger.js');

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  after: {
    all: [ logger() ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [
        logger(),
        // Make sure the password field is never sent to the client
        // Always must be the last hook
        protect('password')
    ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
