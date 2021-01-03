const appLogger = global.appLogger || require('winston').createLogger();

// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
const jwtParser = require('jsonwebtoken');

// Note: caching will not be allowed where data is stored in a different database

// eslint-disable-next-line no-unused-vars
module.exports = function (authorizationHandler) {
    return async (context) => {
        var methodData = getMethod(context);
        var method = methodData.method;
        var methodType = methodData.type;

        var identifierData = getIdentifiers(context);
        var identifier = identifierData.identifier;
        var identifierType = identifierData.type;

        var authorized = identifierData.authorized;

        switch (method) {
            case 'find':
            case 'get':
                // Skip handling as methodType does not need to be considered
                if (methodType == 'before')
                    authorized = true;

                var result = (context.result != null) ? context.result : null;

                if (!authorized && (result == null || (result._id == null && (result.data == null || result.data == [])))) {
                    authorized = true;
                }
                else if (!authorized && result != null) {
                    var resultIsObject = false;

                    if (result._id != null)
                        resultIsObject = true;

                    // Handling here
                    authorized = await authorizationHandler.find(context, result, resultIsObject, identifier, identifierType);
                }
                break;
            case 'patch':
            case 'update':
                // Skip handling as methodType does not need to be considered
                if (methodType == 'after')
                    authorized = true;

                var dataID = (context.id != null) ? context.id : null;

                if (!authorized && dataID == null) {
                    authorized = true;
                }
                else if (!authorized && dataID != null) {
                    // Handling here
                    authorized = await authorizationHandler.update(context, dataID, identifier, identifierType);
                }
                break;
            case 'create':
                // Skip handling as methodType does not need to be considered
                if (methodType == 'after')
                    authorized = true;

                var data = (context.data != null) ? context.data : null;

                if (!authorized && data == null) {
                    // Handling here
                    authorized = await authorizationHandler.create(context, data, identifier, identifierType);
                }
                break;
            case 'remove':
                // Skip handling as methodType does not need to be considered
                if (methodType == 'after')
                    authorized = true;

                var dataID = (context.id != null) ? context.id : null;

                if (!authorized && dataID == null) {
                    authorized = true;
                }
                else if (!authorized && dataID != null) {
                    // Handling here
                    authorized = await authorizationHandler.remove(context, dataID, identifier, identifierType);
                }
        }

        if (!authorized) {
            appLogger.debug('Identifier: ' + identifier);
            appLogger.debug('IdentifierType: ' + identifierType);
            appLogger.debug('Authorization Type: ' + authorizationHandler.type());
            appLogger.debug('Method: ' + method);
            appLogger.debug('Authorized?: ' + authorized);

            context.statusCode = 401;
            context.id = null;
            context.data = null;
            context.result = null;
            context.dispatch = {};
            throw new Error('Not authorized to perform operation: ' + context.path + "." + context.method + " as " + identifierType + " : " + identifier);
        }

        return context;
    };
};


function getMethod(context) {
    var method = (context.method != null) ? context.method : null;
    var methodType = (context.type != null) ? context.type : null;

    return {
        method: method,
        type: methodType
    }
}

function getIdentifiers(context) {
    var payload = (context.params != null && context.params.authentication != null && context.params.authentication.payload != null) ? context.params.authentication.payload : null;
    var user = (context.params != null && context.params.user != null) ? context.params.user : null;
    var authorization = (context.params != null && context.params.headers != null && context.params.headers.authorization) ? context.params.headers.authorization : null;

    var identifier = "";
    var identifierType = "";

    // Variable which determines whether access is authorized
    var authorized = false;

    if (user != null) {
        if (typeof user === 'object') {
            identifier = user._id;
            identifierType = 'user';
        }
        else {
            identifier = user;
            identifierType = 'team';
        }
    }
    else if (payload != null && payload.userId != null) {
        identifier = payload.userId;
        identifierType = 'user';
    }
    else if (authorization != null && context.params != null && context.params.headers != null) {
        identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;
        identifierType = 'user';
    }
    else if (context.params != null && context.params.provider == null) {
        // Server entries automatically authorized
        authorized = true;
    }

    if (identifier == null)
        identifier = "";

    return {
        identifier: identifier,
        type: identifierType,
        authorized: authorized
    };
}