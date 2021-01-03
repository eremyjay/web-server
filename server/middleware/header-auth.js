const appLogger = global.appLogger || require('winston').createLogger();

// https://expressjs.com/en/api.html#req.ip
const { NotAuthenticated } = require('@feathersjs/errors');



module.exports = function (app, header, headerKey) {
    return async function (req, res, next) {
        const token = (req.get(header) != null) ? req.get(header) : "";

        if (token == app[headerKey]) {
            next();
        }
        else {
            res.status(401).end();
        }
    }
}