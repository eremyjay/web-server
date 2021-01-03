const appLogger = global.appLogger || require('winston').createLogger();

// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
const { authenticate } = require('@feathersjs/authentication');
const jwtParser = require('jsonwebtoken');

const unique = require('../shared/unique.js');
const mongoose = require('mongoose');

const DynamicConnection = require('../shared/connection/dynamic.js');
// Note: caching will not be allowed where data is stored in a different database

// eslint-disable-next-line no-unused-vars
module.exports = function (authorizationType) {
    return async (context) => {
        var payload = (context.params != null && context.params.authentication != null && context.params.authentication.payload != null) ? context.params.authentication.payload : null;
        var user = (context.params != null && context.params.user != null) ? context.params.user : null;
        var authorization = (context.params != null && context.params.headers != null && context.params.headers.authorization) ? context.params.headers.authorization : null;

        var method = (context.method != null) ? context.method : null;
        var methodType = (context.type != null) ? context.type : null;

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
        else if (authorization != null) {
            identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;
            identifierType = 'user';
        }
        else if (context.params != null && context.params.provider == null) {
            // Server entries automatically authorized
            authorized = true;
        }

        if (identifier == null)
            identifier = "";


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
                else if (!authorized) {
                    var resultIsObject = false;

                    if (result._id != null)
                        resultIsObject = true;

                    switch (authorizationType) {
                        case 'user':
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
                                        avatar: context.result.avatar,
                                        status: context.result.status,
                                        tokenExpiry: context.result.tokenExpiry
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            avatar: context.result.avatar,
                                            status: context.result.status,
                                            tokenExpiry: context.result.tokenExpiry
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'team':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    for (var i = 0; i < result.members.length; i++) {
                                        if (result.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var found = false;
                                        for (var j = 0; j < result.data[i].members.length; j++) {
                                            if (result.data[i].members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }

                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result._id.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var found = false;
                                        for (var j = 0; j < result.data[i].members.length; j++) {
                                            if (result.data[i].members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }
                                        
                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        members: context.result.members,
                                        invites: context.result.invites
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            members: context.result.data[0].members,
                                            invites: context.result.invites
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'interaction':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }
                                        
                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].team.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        team: context.result.team
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            team: context.result.data[0].team
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'template':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    if (result.public)
                                        authorized = true;
                                    else {
                                        var team = await context.app.service('teams').get(result.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].public)
                                            authorized = true;
                                        else {
                                            var team = await context.app.service('teams').get(result.data[i].team, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.public)
                                        authorized = true;
                                    else {
                                        if (result.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].public) {
                                            if (result.data[i].team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        team: context.result.team
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            team: context.result.data[0].team
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'conversation':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var interaction = await context.app.service('interactions').get(result.interaction, {
                                        query: {
                                            $select: ['_id', 'team']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    var team = await context.app.service('teams').get(interaction.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var interaction = await context.app.service('interactions').get(result.data[i].interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        var team = await context.app.service('teams').get(interaction.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }

                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    var interaction = await context.app.service('interactions').get(result.interaction, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    if (interaction.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var interaction = await context.app.service('interactions').get(result.data[i].interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        if (interaction.team.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        interaction: context.result.interaction
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            interaction: context.result.data[0].interaction
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'conversible':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    // Special access required for these data tables
                                    const mappings = context.app.service('mappings');
                                    var mappingList = await mappings.find({
                                        query: {
                                            from: result.conversation,
                                            toType: 'connection',
                                            $select: ['_id', 'to']
                                        }
                                    });

                                    var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                    // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                    const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                    if (connectionID != null)
                                        context.params.$skipCacheHook = true;

                                    var conversation = await conversations.get(result.conversation, {
                                        query: {
                                            $select: ['_id', 'interaction']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                    var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                        query: {
                                            $select: ['_id', 'team']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    var team = await context.app.service('teams').get(interaction.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    // Special access required for these data tables
                                    const mappings = context.app.service('mappings');
                                    var from = (result.data[0] != null) ? result.data[0].conversation : mongoose.Types.ObjectId();
                                    var mappingList = await mappings.find({
                                        query: {
                                            from: from,
                                            toType: 'connection',
                                            $select: ['_id', 'to']
                                        }
                                    });

                                    var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                    // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                    const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                    if (connectionID != null)
                                        context.params.$skipCacheHook = true;

                                    for (var i = 0; i < result.data.length; i++) {
                                        var conversation = await conversations.get(result.data[i].conversation, {
                                            query: {
                                                $select: ['_id', 'interaction']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                        var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        var team = await context.app.service('teams').get(interaction.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }
                                        
                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    // Special access required for these data tables
                                    const mappings = context.app.service('mappings');
                                    var mappingList = await mappings.find({
                                        query: {
                                            from: result.conversation,
                                            toType: 'connection',
                                            $select: ['_id', 'to']
                                        }
                                    });

                                    var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                    // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                    const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                    var conversation = await conversations.get(result.conversation, {
                                        query: {
                                            $select: ['_id', 'interaction']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                    var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    if (interaction.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var conversation = await context.app.service('interactions').get(result.data[i].conversation, {
                                            query: {
                                                $select: ['_id', 'interaction']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                        var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        if (interaction.team.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        interaction: context.result.interaction
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            interaction: context.result.data[0].interaction
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'liveconversation':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }
                                        
                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].team.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        interaction: context.result.interaction
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            interaction: context.result.data[0].interaction
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'statistic':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'interaction') {
                                        var interaction = await context.app.service('interactions').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        var team = await context.app.service('teams').get(interaction.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'interaction') {
                                            var interaction = await context.app.service('interactions').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            var team = await context.app.service('teams').get(interaction.team, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'interaction') {
                                        var interaction = await context.app.service('interactions').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        if (interaction.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'interaction') {
                                            var interaction = await context.app.service('interactions').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            if (interaction.team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        referenceIdentifier: context.result.referenceIdentifier,
                                        referenceIdentifierType: context.result.referenceIdentifierType
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            referenceIdentifier: context.result.data[0].referenceIdentifier,
                                            referenceIdentifierType: context.result.data[0].referenceIdentifierType
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'licence':
                            // Direct manipulation of licences not allowed - only via server
                            /*
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.identifier, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].identifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }
                                        
                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.identifier.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].identifier.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        identifier: context.result.identifier,
                                        identifierType: context.result.identifierType
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            identifier: context.result.data[0].identifier,
                                            identifierType: context.result.data[0].identifierType
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            */
                            break;
                        case 'message':
                            authorized = true;
                            break;
                        case 'subscription':
                            var dataID = (context.id != null) ? context.id : ((context.params != null && context.params.query != null && context.params.query.identifier != null) ? context.params.query.identifier : null);
                            if (identifierType == 'user') {
                                var team = await context.app.service('teams').get(dataID, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var interaction = await context.app.service('licences').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                if (interaction.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'invite':
                            authorized = true; // Allow viewing of data related to invites as not high risk
                            break;
                        case 'notification':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'team') {
                                        var team = await context.app.service('teams').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                    else if (result.referenceIdentifierType == 'user') {
                                        if (result.referenceIdentifier.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'team') {
                                            var team = await context.app.service('teams').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'user') {
                                            if (result.data[i].referenceIdentifier.toString() != identifier.toString())
                                                authorized = false; // Don't allow access to other users' data - full decline
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'team') {
                                        if (result.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                    else if (result.referenceIdentifierType == 'user') {
                                        var team = await context.app.service('teams').get(identifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == result.referenceIdentifier.toString())
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'team') {
                                            if (result.data[i].team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'user') {
                                            var team = await context.app.service('teams').get(identifier, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == result.data[i].referenceIdentifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        team: context.result.team
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            team: context.result.data[0].team
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'queue':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'team') {
                                        var team = await context.app.service('teams').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                    else if (result.referenceIdentifierType == 'user') {
                                        if (result.referenceIdentifier.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'team') {
                                            var team = await context.app.service('teams').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'user') {
                                            if (result.data[i].referenceIdentifier.toString() != identifier.toString())
                                                authorized = false; // Don't allow access to other users' data - full decline
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'team') {
                                        if (result.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                    else if (result.referenceIdentifierType == 'user') {
                                        var team = await context.app.service('teams').get(identifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == result.referenceIdentifier.toString())
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'team') {
                                            if (result.data[i].team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'user') {
                                            var team = await context.app.service('teams').get(identifier, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == result.data[i].referenceIdentifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        team: context.result.team
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            team: context.result.data[0].team
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'media':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'interaction') {
                                        var interaction = await context.app.service('interactions').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        var team = await context.app.service('teams').get(interaction.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                    else if (result.referenceIdentifierType == 'conversation') {
                                        // Special access required for these data tables
                                        const mappings = context.app.service('mappings');
                                        var mappingList = await mappings.find({
                                            query: {
                                                from: result.referenceIdentifier,
                                                toType: 'connection',
                                                $select: ['_id', 'to']
                                            }
                                        });

                                        var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                        // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                        const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                        if (connectionID != null)
                                            context.params.$skipCacheHook = true;

                                        var conversation = await conversations.get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'interaction']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                        var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        var team = await context.app.service('teams').get(interaction.team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        for (var i = 0; i < team.members.length; i++) {
                                            if (team.members[i].user.toString() == identifier.toString())
                                                authorized = true;
                                        }
                                    }
                                    else if (result.referenceIdentifierType == 'page') {
                                        var authorizedUsers = context.app.get('authentication').admin;

                                        identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;

                                        var userData = await context.app.service('users').get(identifier, {
                                            query: {
                                                $select: ['_id', 'email', '']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        userData = userData || { token: unique.generateUUID() };

                                        for (var j = 0; j < authorizedUsers.length; j++) {
                                            if (userData.email == authorizedUsers)
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'interaction') {
                                            var interaction = await context.app.service('interactions').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            var team = await context.app.service('teams').get(interaction.team, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'conversation') {
                                            // Special access required for these data tables
                                            const mappings = context.app.service('mappings');
                                            var from = (result.data[0] != null) ? result.data[0].referenceIdentifier : mongoose.Types.ObjectId();
                                            var mappingList = await mappings.find({
                                                query: {
                                                    from: from,
                                                    toType: 'connection',
                                                    $select: ['_id', 'to']
                                                }
                                            });

                                            var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                            // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                            const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                            if (connectionID != null)
                                                context.params.$skipCacheHook = true;

                                            var conversation = await conversations.get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'interaction']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                            var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            var team = await context.app.service('teams').get(interaction.team, {
                                                query: {
                                                    $select: ['_id', 'members']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            team = team || { members: [] };

                                            var found = false;
                                            for (var j = 0; j < team.members.length; j++) {
                                                if (team.members[j].user.toString() == identifier.toString()) {
                                                    authorized = true;
                                                    found = true;
                                                }
                                            }

                                            if (!found) {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'page') {
                                            var authorizedUsers = context.app.get('authentication').admin;

                                            identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;

                                            var userData = await context.app.service('users').get(identifier, {
                                                query: {
                                                    $select: ['_id', 'email', '']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            userData = userData || { token: unique.generateUUID() };

                                            for (var j = 0; j < authorizedUsers.length; j++) {
                                                if (userData.email == authorizedUsers)
                                                    authorized = true;
                                            }
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifierType == 'interaction') {
                                        var interaction = await context.app.service('interactions').get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        if (interaction.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                    else if (result.referenceIdentifierType == 'conversation') {
                                        // Special access required for these data tables
                                        const mappings = context.app.service('mappings');
                                        var mappingList = await mappings.find({
                                            query: {
                                                from: result.referenceIdentifier,
                                                toType: 'connection',
                                                $select: ['_id', 'to']
                                            }
                                        });

                                        var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                        // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                        const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                        var conversation = await conversations.get(result.referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'interaction']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                        var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                            query: {
                                                $select: ['_id', 'team']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        interaction = interaction || { team: mongoose.Types.ObjectId() };

                                        if (interaction.team.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                    else if (result.referenceIdentifierType == 'page') {
                                        var authorizedUsers = context.app.get('authentication').admin;

                                        identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;

                                        var userData = await context.app.service('users').get(identifier, {
                                            query: {
                                                $select: ['_id', 'email', '']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        userData = userData || { token: unique.generateUUID() };

                                        for (var j = 0; j < authorizedUsers.length; j++) {
                                            if (userData.email == authorizedUsers)
                                                authorized = true;
                                        }
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifierType == 'interaction') {
                                            var interaction = await context.app.service('interactions').get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            if (interaction.team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'conversation') {
                                            // Special access required for these data tables
                                            const mappings = context.app.service('mappings');
                                            var from = (result.data[0] != null) ? result.data[0].referenceIdentifier : mongoose.Types.ObjectId();
                                            var mappingList = await mappings.find({
                                                query: {
                                                    from: from,
                                                    toType: 'connection',
                                                    $select: ['_id', 'to']
                                                }
                                            });

                                            var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                            // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                            const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                            if (connectionID != null)
                                                context.params.$skipCacheHook = true;

                                            var conversation = await conversations.get(result.data[i].referenceIdentifier, {
                                                query: {
                                                    $select: ['_id', 'interaction']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                            var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                                query: {
                                                    $select: ['_id', 'team']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                                            if (interaction.team.toString() == identifier.toString())
                                                authorized = true;
                                            else {
                                                context.result.data.splice(i, 1);
                                                context.result.total--;
                                                result = context.result;
                                                i--;
                                            }
                                        }
                                        else if (result.data[i].referenceIdentifierType == 'page') {
                                            var authorizedUsers = context.app.get('authentication').admin;

                                            identifier = jwtParser.verify(context.params.headers.authorization, context.app.get('authentication').secret).sub;

                                            var userData = await context.app.service('users').get(identifier, {
                                                query: {
                                                    $select: ['_id', 'email', '']
                                                }
                                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                            userData = userData || { token: unique.generateUUID() };

                                            for (var j = 0; j < authorizedUsers.length; j++) {
                                                if (userData.email == authorizedUsers)
                                                    authorized = true;
                                            }
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        referenceIdentifier: context.result.referenceIdentifier,
                                        referenceIdentifierType: context.result.referenceIdentifierType
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            referenceIdentifier: context.result.data[0].referenceIdentifier,
                                            referenceIdentifierType: context.result.data[0].referenceIdentifierType
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'connection':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].team, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }

                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].team.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        team: context.result.team
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            team: context.result.data[0].team
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'oauth':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.identifier, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].identifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }

                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.identifier.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].identifier.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        identifier: context.result.identifier
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            identifier: context.result.data[0].identifier
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'hook':
                            if (identifierType == 'user') {
                                if (resultIsObject) {
                                    var team = await context.app.service('teams').get(result.referenceIdentifier, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        var team = await context.app.service('teams').get(result.data[i].referenceIdentifier, {
                                            query: {
                                                $select: ['_id', 'members']
                                            }
                                        }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                        team = team || { members: [] };

                                        var found = false;
                                        for (var j = 0; j < team.members.length; j++) {
                                            if (team.members[j].user.toString() == identifier.toString()) {
                                                authorized = true;
                                                found = true;
                                            }
                                        }

                                        if (!found) {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                if (resultIsObject) {
                                    if (result.referenceIdentifier.toString() == identifier.toString())
                                        authorized = true;
                                }
                                else {
                                    for (var i = 0; i < result.data.length; i++) {
                                        if (result.data[i].referenceIdentifier.toString() == identifier.toString())
                                            authorized = true;
                                        else {
                                            context.result.data.splice(i, 1);
                                            context.result.total--;
                                            result = context.result;
                                            i--;
                                        }
                                    }
                                }
                            }

                            // Protect data leaked where not authorized for restricted access for authentication only
                            if (!authorized) {
                                if (resultIsObject) {
                                    context.dispatch = {
                                        '_id': context.result._id,
                                        referenceIdentifier: context.result.referenceIdentifier
                                    };
                                }
                                else {
                                    if (context.result.data.length > 0) {
                                        context.result.data = [{
                                            '_id': context.result.data[0]._id,
                                            referenceIdentifier: context.result.data[0].referenceIdentifier
                                        }];
                                    }
                                }

                                context.params.$skipCacheHook = true;
                                authorized = true;
                            }
                            break;
                        case 'mapping':
                            // Allow anyone to see mappings
                            authorized = true;
                            break;
                        case 'server':
                            // Do not allow authentication unless at server level
                            break;
                    }
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
                else if (!authorized) {
                    switch (authorizationType) {
                        case 'user':
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
                            break;
                        case 'team':
                            if (identifierType == 'user') {
                                var team = await context.app.service('teams').get(dataID, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString() && team.members[i].role == 'admin')
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                if (dataID.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'interaction':
                            if (identifierType == 'user') {
                                var interaction = await context.app.service('interactions').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(interaction.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var interaction = await context.app.service('interactions').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                if (interaction.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'template':
                            if (identifierType == 'user') {
                                var template = await context.app.service('templates').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                template = template || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(template.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var template = await context.app.service('templates').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                template = template || { team: mongoose.Types.ObjectId() };

                                if (template.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'conversation':
                            if (identifierType == 'user') {
                                // Special access required for these data tables
                                const mappings = context.app.service('mappings');
                                var mappingList = await mappings.find({
                                    query: {
                                        from: dataID,
                                        toType: 'connection',
                                        $select: ['_id', 'to']
                                    }
                                });

                                var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                var conversation = await conversations.get(dataID, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(interaction.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                // Special access required for these data tables
                                const mappings = context.app.service('mappings');
                                var mappingList = await mappings.find({
                                    query: {
                                        from: dataID,
                                        toType: 'connection',
                                        $select: ['_id', 'to']
                                    }
                                });

                                var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');

                                var conversation = await conversations.get(dataID, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                if (interaction.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'conversible':
                            if (identifierType == 'user') {
                                // Special access required for these data tables
                                const mappings = context.app.service('mappings');
                                var mappingList = await mappings.find({
                                    query: {
                                        from: dataID,
                                        toType: 'connection',
                                        $select: ['_id', 'to']
                                    }
                                });

                                var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');
                                const conversibles = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversibles : context.app.service('conversibles');

                                var conversible = await conversibles.get(dataID, {
                                    query: {
                                        $select: ['_id', 'conversation', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversible = conversible || { conversation: mongoose.Types.ObjectId() };

                                var conversation = await conversations.get(conversible.conversation, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(interaction.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                // Special access required for these data tables
                                const mappings = context.app.service('mappings');
                                var mappingList = await mappings.find({
                                    query: {
                                        from: dataID,
                                        toType: 'connection',
                                        $select: ['_id', 'to']
                                    }
                                });

                                var connectionID = (mappingList.data.length > 0) ? mappingList.data[0].to : null;

                                // await DynamicConnection.ensureDynamicConnection(context.app, connectionID);
                                const conversations = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversations : context.app.service('conversations');
                                const conversibles = (context.app.dynamicConnections[connectionID] != null) ? context.app.dynamicConnections[connectionID].conversibles : context.app.service('conversibles');

                                var conversible = await conversibles.get(dataID, {
                                    query: {
                                        $select: ['_id', 'conversation', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversible = conversible || { conversation: mongoose.Types.ObjectId() };

                                var conversation = await conversations.get(conversible.conversation, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                                var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                if (interaction.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'liveconversation':
                            if (identifierType == 'user') {
                                var liveConversation = await context.app.service('liveconversations').get(dataID, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                liveConversation = liveConversation || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(liveConversation.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var liveConversation = await context.app.service('liveconversations').get(dataID, {
                                    query: {
                                        $select: ['_id', 'interaction']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                liveConversation = liveConversation || { team: mongoose.Types.ObjectId() };

                                if (liveConversation.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'statistic':
                            if (identifierType == 'user') {
                                var statistic = await context.app.service('statistics').get(dataID, {
                                    query: {
                                        $select: ['_id', 'referenceIdentifier', 'referenceIdentifierType']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                statistic = statistic || { referenceIdentifier: mongoose.Types.ObjectId() };

                                if (statistic.referenceIdentifierType == 'interaction') {
                                    var interaction = await context.app.service('interactions').get(statistic.referenceIdentifier, {
                                        query: {
                                            $select: ['_id', 'team']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    var team = await context.app.service('teams').get(interaction.team, {
                                        query: {
                                            $select: ['_id', 'members']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    team = team || { members: [] };

                                    for (var i = 0; i < team.members.length; i++) {
                                        if (team.members[i].user.toString() == identifier.toString())
                                            authorized = true;
                                    }
                                }
                            }
                            else if (identifierType == 'team') {
                                var statistic = await context.app.service('statistics').get(dataID, {
                                    query: {
                                        $select: ['_id', 'referenceIdentifier', 'referenceIdentifierType']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                statistic = statistic || { referenceIdentifier: mongoose.Types.ObjectId() };

                                if (statistic.referenceIdentifierType == 'interaction') {
                                    var interaction = await context.app.service('interactions').get(statistic.referenceIdentifier, {
                                        query: {
                                            $select: ['_id', 'team']
                                        }
                                    }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                    interaction = interaction || { team: mongoose.Types.ObjectId() };

                                    if (interaction.team.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            break;
                        case 'licence':
                            // Direct manipulation of licences not allowed - only via server
                            /*
                            if (identifierType == 'user') {
                                var licence = await context.app.service('licences').get(dataID, {
                                    query: {
                                        $select: ['_id', 'identifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                licence = licence || { identifier: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(licence.identifier, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var licence = await context.app.service('licences').get(dataID, {
                                    query: {
                                        $select: ['_id', 'identifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                licence = licence || { identifier: mongoose.Types.ObjectId() };

                                if (licence.identifier.toString() == identifier.toString())
                                    authorized = true;
                            }
                            */
                            break;
                        case 'message':
                            authorized = true;
                            break;
                        case 'subscription':
                            if (identifierType == 'user') {
                                var team = await context.app.service('teams').get(dataID, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                if (dataID.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'invite':
                            if (identifierType == 'user') {
                                if (dataID.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'connection':
                            if (identifierType == 'user') {
                                var connection = await context.app.service('connections').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                connection = connection || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(connection.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var connection = await context.app.service('connections').get(dataID, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                connection = connection || { team: mongoose.Types.ObjectId() };

                                if (connection.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'oauth':
                            if (identifierType == 'user') {
                                var oauth = await context.app.service('oauth').get(dataID, {
                                    query: {
                                        $select: ['_id', 'identifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                oauth = oauth || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(oauth.identifier, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var oauth = await context.app.service('oauth').get(dataID, {
                                    query: {
                                        $select: ['_id', 'identifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                oauth = oauth || { team: mongoose.Types.ObjectId() };

                                if (oauth.identifier.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'hook':
                            if (identifierType == 'user') {
                                var hook = await context.app.service('hooks').get(dataID, {
                                    query: {
                                        $select: ['_id', 'referenceIdentifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                hook = hook || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(hook.referenceIdentifier, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                            else if (identifierType == 'team') {
                                var hook = await context.app.service('oauth').get(dataID, {
                                    query: {
                                        $select: ['_id', 'referenceIdentifier']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                hook = hook || { team: mongoose.Types.ObjectId() };

                                if (hook.referenceIdentifier.toString() == identifier.toString())
                                    authorized = true;
                            }
                            break;
                        case 'notification':
                            // Do not allow authentication unless at server level
                            break;
                        case 'queue':
                            // Do not allow authentication unless at server level
                            break;
                        case 'media':
                            // Do not allow authentication unless at server level
                            break;
                        case 'mapping':
                            // Do not allow authentication unless at server level
                            break;
                        case 'server':
                            // Do not allow authentication unless at server level
                            break;
                    }
                }
                break;
            case 'create':
                // Skip handling as methodType does not need to be considered
                if (methodType == 'after')
                    authorized = true;

                var data = (context.data != null) ? context.data : null;

                switch (authorizationType) {
                    case 'user':
                        authorized = true;
                        break;
                    case 'team':
                        if (identifierType == 'user') {
                            for (var i = 0; i < data.members.length; i++) {
                                if (data.members[i].user.toString() == identifier.toString() && data.members[i].role == 'admin')
                                    authorized = true;
                            }
                        }
                        break;
                    case 'interaction':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.team.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'template':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.team.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'conversation':
                        // Do not allow authentication unless at server level
                        /*
                        if (identifierType == 'user') {
                            var interaction = await context.app.service('interactions').get(data.interaction, {
                                query: {
                                    $select: ['_id', 'team']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                            var team = await context.app.service('teams').get(interaction.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            var interaction = await context.app.service('interactions').get(data.interaction, {
                                query: {
                                    $select: ['_id', 'team']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                            if (interaction.team.toString() == identifier.toString())
                                authorized = true;
                        }
                        */
                        break;
                    case 'conversible':
                        // Do not allow authentication unless at server level
                        /*
                        if (identifierType == 'user') {
                            var conversation = await conversations.get(data.conversation, {
                                query: {
                                    $select: ['_id', 'interaction']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                            var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                query: {
                                    $select: ['_id', 'team']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                            var team = await context.app.service('teams').get(interaction.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            var conversation = await conversations.get(data.conversation, {
                                query: {
                                    $select: ['_id', 'interaction']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            conversation = conversation || { interaction: mongoose.Types.ObjectId() };

                            var interaction = await context.app.service('interactions').get(conversation.interaction, {
                                query: {
                                    $select: ['_id', 'team']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            interaction = interaction || { team: mongoose.Types.ObjectId() };

                            if (interaction.team.toString() == identifier.toString())
                                authorized = true;
                        }
                        */
                        break;
                    case 'liveconversation':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.team.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'statistic':
                        if (identifierType == 'user') {
                            if (data.referenceIdentifierType == 'interaction') {
                                var interaction = await context.app.service('interactions').get(data.referenceIdentifier, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                var team = await context.app.service('teams').get(interaction.team, {
                                    query: {
                                        $select: ['_id', 'members']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                team = team || { members: [] };

                                for (var i = 0; i < team.members.length; i++) {
                                    if (team.members[i].user.toString() == identifier.toString())
                                        authorized = true;
                                }
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.referenceIdentifierType == 'interaction') {
                                var interaction = await context.app.service('interactions').get(data.referenceIdentifier, {
                                    query: {
                                        $select: ['_id', 'team']
                                    }
                                }).catch(error => { appLogger.error('%o', error); authorized = false; });

                                interaction = interaction || { team: mongoose.Types.ObjectId() };

                                if (interaction.team.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        break;
                    case 'licence':
                        // Direct manipulation of licences not allowed - only via server
                        /*
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.identifier, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.identifier.toString() == identifier.toString())
                                authorized = true;
                        }
                        */
                        break;
                    case 'message':
                        authorized = true;
                        break;
                    case 'subscription':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.identifierObject._id, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.identifierObject._id.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'invite':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.team, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString() && team.members[i].role == 'admin')
                                    authorized = true;
                            }

                            if (data.team.toString() == team._id.toString())
                                authorized = true;
                        }
                        break;
                    case 'oauth':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.identifier, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.identifier.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'hook':
                        if (identifierType == 'user') {
                            var team = await context.app.service('teams').get(data.referenceIdentifier, {
                                query: {
                                    $select: ['_id', 'members']
                                }
                            }).catch(error => { appLogger.error('%o', error); authorized = false; });

                            team = team || { members: [] };

                            for (var i = 0; i < team.members.length; i++) {
                                if (team.members[i].user.toString() == identifier.toString())
                                    authorized = true;
                            }
                        }
                        else if (identifierType == 'team') {
                            if (data.referenceIdentifier.toString() == identifier.toString())
                                authorized = true;
                        }
                        break;
                    case 'notification':
                        // Do not allow authentication unless at server level
                        break;
                    case 'queue':
                        // Do not allow authentication unless at server level
                        break;
                    case 'media':
                        // Allow making of media without special requirements if authenticated
                        authorized = true;
                        break;
                    case 'connection':
                        // Do not allow authentication unless at server level
                        break;
                    case 'mapping':
                        // Do not allow authentication unless at server level
                        break;
                    case 'server':
                        // Do not allow authentication unless at server level
                        break;
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
                else if (!authorized) {
                    // Do not allow authentication at all unless at server level - no deleting allowed
                    switch (authorizationType) {
                    }
                }
                break;
        }

        if (authorized);
        if (!authorized) {
            appLogger.debug('Identifier: ' + identifier);
            appLogger.debug('IdentifierType: ' + identifierType);
            appLogger.debug('Authorization Type: ' + authorizationType);
            appLogger.debug('Method: ' + method);
            appLogger.debug('Authorized?: ' + authorized);

            context.statusCode = 401;
            context.dispatch = {};
            throw new Error('Not authorized to perform operation: ' + context.path + "." + context.method + " as " + identifierType + " : " + identifier);
        }

        return context;
    };
};