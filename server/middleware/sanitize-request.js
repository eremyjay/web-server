const createDOMPurify = require('dompurify');
const jsdom = require('jsdom');
const domWindow = (jsdom != null) ? (new jsdom.JSDOM('', {
    features: {
        FetchExternalResources: false, // disables resource loading over HTTP / filesystem
        ProcessExternalResources: false // do not execute JS within script blocks
    }
})).window : window;
const Purify = createDOMPurify(domWindow);

const util = require('../shared/util.js');


module.exports = function () {
    return async function sanitizeRequest(req, res, next) {
        var purifyConfig = {
            ADD_TAGS: [],
            ADD_ATTR: ['target'],
            ADD_DATA_URI_TAGS: [],
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|xxx|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+=,./\-:;]|$))/i
        };

        var queryConfig = purifyConfig;
        await util.applyFuncAndModifyObject(req.query, function() {
            switch (this.constructor) {
                case String:
                    return Purify.sanitize(this, queryConfig);
                case Number:
                case Boolean:
                case BigInt:
                case Symbol:
                    return this.valueOf();
                default:
                    return this;
            }
        });

        var bodyConfig = purifyConfig;
        if (req.originalUrl.startsWith('/pages/')) {
            bodyConfig.ADD_TAGS.push('script');
            bodyConfig.ADD_TAGS.push('link');
            bodyConfig.ADD_ATTR.push('type');
            bodyConfig.ADD_ATTR.push('rel');
            bodyConfig.FORCE_BODY = true;
        }

        if (typeof req.body === 'string') {
            req.body = Purify.sanitize(req.body, bodyConfig);
        }
        else {
            await util.applyFuncAndModifyObject(req.body, function () {
                switch (this.constructor) {
                    case String:
                        return Purify.sanitize(this, bodyConfig);
                    case Number:
                    case Boolean:
                    case BigInt:
                    case Symbol:
                        return this.valueOf();
                    default:
                        return this;
                }
            });
        }

        var paramsConfig = purifyConfig;
        await util.applyFuncAndModifyObject(req.params, function() {
            switch (this.constructor) {
                case String:
                    return Purify.sanitize(this, paramsConfig);
                case Number:
                case Boolean:
                case BigInt:
                case Symbol:
                    return this.valueOf();
                default:
                    return this;
            }
        });

        next();
    };
};
