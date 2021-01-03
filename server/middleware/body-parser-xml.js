const xmlConvert = require('xml-js');
const typeis = require('type-is');

const xmlConvertOptions = {
    compact: true
}


module.exports = function (app) {
    return async function (req, res, next) {
        if (typeis(req, ['*/xml'])) {
            var data = xmlConvert.xml2js(req.body, xmlConvertOptions);
            req.body = data;
        }

        next();
    };
};
