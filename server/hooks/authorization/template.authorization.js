const appLogger = global.appLogger || require('winston').createLogger();

// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
const mongoose = require('mongoose');

// Note: caching will not be allowed where data is stored in a different database

module.exports = {
    find: find,
    update: update,
    create: create,
    remove: remove,
    type: type
};

async function find(context, result, resultIsObject, identifier, identifierType) {
    var authorized = false;

    return authorized;
}

async function update(context, dataID, identifier, identifierType) {
    var authorized = false;

    return authorized;
}

async function create(context, data, identifier, identifierType) {
    var authorized = false;

    return authorized;
}

async function remove(context, dataID, identifier, identifierType) {
    var authorized = false;

    return authorized;
}

function type() {
    return 'authorization-type';
}
