const appLogger = global.appLogger || require('winston').createLogger();

// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
const unique = require('../../shared/unique.js');
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

    if (identifierType == 'user') {
        if (resultIsObject) {
            if (result._id.toString() == identifier.toString())
                authorized = true;
            else {
                var teamList = await context.app.service('teams').find({
                    query: {
                        'members.user': identifier,
                        $select: ['_id', 'members']
                    }
                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                // Allow team members to see other team member's data
                for (var i = 0; i < teamList.data.length; i++) {
                    var team = teamList.data[i];
                    for (var j = 0; j < team.members.length; j++) {
                        if (team.members[j].user.toString() == result._id.toString())
                            authorized = true;
                    }
                }
            }
        }
        else {
            var teamList = await context.app.service('teams').find({
                query: {
                    'members.user': identifier,
                    $select: ['_id', 'members']
                }
            }).catch(error => { appLogger.error('%o', error); authorized = false; });

            for (var i = 0; i < result.data.length; i++) {
                var found = false;

                // Allow team members to see other team member's data
                for (var j = 0; j < teamList.data.length; j++) {
                    var team = teamList.data[j];
                    for (var k = 0; k < team.members.length; k++) {
                        if (team.members[k].user.toString() == result.data[i]._id.toString())
                            found = true;
                    }
                }

                if (!found && result.data[i]._id.toString() != identifier.toString()) {
                    context.result.data.splice(i, 1);
                    context.result.total--;
                    result = context.result;
                    i--;
                }
                else {
                    authorized = true;
                }
            }

            // Allow access if token based
            if (result.data.length == 1 && context.params.query != null &&
                context.params.query.token == result.data[0].token && Date.now() <= Date.parse(result.data[0].tokenExpiry))
                authorized = true;
        }
    }

    // Protect data leak where not authorized for restricted access for authentication only
    if (!authorized) {
        if (resultIsObject) {
            context.dispatch = {
                '_id': context.result._id,
                // avatar: context.result.avatar,
                // status: context.result.status,
                tokenExpiry: context.result.tokenExpiry
            };
        }
        else {
            if (context.result.data.length > 0) {
                delete context.result.total;
                delete context.result.limit;
                delete context.result.skip;

                context.result.data = [{
                    '_id': context.result.data[0]._id,
                    // avatar: context.result.avatar,
                    // status: context.result.status,
                    tokenExpiry: context.result.tokenExpiry
                }];
            }
            else {
                delete context.result.total;
                delete context.result.limit;
                delete context.result.skip;
            }
        }

        context.params.$skipCacheHook = true;
        authorized = true;
    }

    return authorized;
}

async function update(context, dataID, identifier, identifierType) {
    var authorized = false;

    if (identifierType == 'user') {
        if (dataID.toString() == identifier.toString())
            authorized = true;
    }
    else {
        var userData = await context.app.service('users').get(dataID, {
            query: {
                $select: ['_id', 'token', 'tokenExpiry']
            }
        }).catch(error => { appLogger.error('%o', error); authorized = false; });

        userData = userData || { token: unique.generateUUID() };

        // Allow access if token based
        if (context.data.token != null && context.data.token == userData.token && Date.now() <= Date.parse(userData.tokenExpiry))
            authorized = true;
    }

    return authorized;
}

async function create(context, data, identifier, identifierType) {
    var authorized = false;

    authorized = true;

    return authorized;
}

async function remove(context, dataID, identifier, identifierType) {
    var authorized = false;

    return authorized;
}

function type() {
    return 'user';
}
