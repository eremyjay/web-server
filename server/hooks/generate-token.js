// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html

const unique = require('../shared/unique.js');

// eslint-disable-next-line no-unused-vars
module.exports = function (options = {}) {
    return async context => {
        if (context.data.generateToken) {
            context.data.token = unique.generateUUID();
            context.data.tokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
        }

        return context;
    };
};
