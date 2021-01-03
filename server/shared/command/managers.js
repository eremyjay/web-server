const appLogger = global.appLogger || require('winston').createLogger();

const QueueManager = require('../../shared/command/queue.js');

const moment = require('moment');
const mongoose = require('mongoose');

const request = require('postman-request');

const unique = require('../../shared/unique.js');
var keyLength = 32;

module.exports = {
    getCapabilities: getCapabilities,
    initManagers: initManagers,
    runFrequentManagers: runFrequentManagers,
    runInfrequentManagers: runInfrequentManagers,
    startQueueManagerService: startQueueManagerService,
    updateUsersStatus: updateUsersStatus,
    assignQueueServer: assignQueueServer,
    manageWhatsappInstances: manageWhatsappInstances,
    manageDiscordInstances: manageDiscordInstances,
    manageSignalInstances: manageSignalInstances,
    manageInstagramInstances: manageInstagramInstances,
    manageLinkedInInstances: manageLinkedInInstances,
    cleanUpManagers: cleanUpManagers
};


function getCapabilities() {
    var capabilities = [
        'manageWhatsApp',
        'manageDiscord',
        'manageSignal',
        'manageInstagram',
        'manageLinkedIn',
        'updateUsersStatus',
        'queueServer',
        'cleanUpManagers'
    ];

    return capabilities;
}

function initManagers(app) {
    startQueueManagerService(app);
}

function runFrequentManagers(app) {
    manageWhatsappInstances(app);
    manageDiscordInstances(app);
    manageSignalInstances(app);
    manageInstagramInstances(app);
    manageLinkedInInstances(app);
}

function runInfrequentManagers(app) {
    updateUsersStatus(app);
    assignQueueServer(app);
    cleanUpManagers(app);
}

function startQueueManagerService(app) {
    appLogger.info("Starting Queue Manager Service");
    app.queueManager = QueueManager.init(app);
}


var updatingStatuses = false;
function updateUsersStatus(app) {
    if (!updatingStatuses) {
        appLogger.debug('Updating status of users');
        const users = app.service('users');

        updatingStatuses = true;
        searchAndUpdate(0);

        function searchAndUpdate(skip) {
            var limit = 100;

            users.find({
                query: {
                    status: {
                        $in: ['online', 'away', 'busy']
                    },
                    $select: ['_id', 'status', 'lastActive'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(result => {
                var userList = result.data;
                if (userList.length == 0) {
                    updatingStatuses = false;
                }
                else {
                    for (var i = 0; i < userList.length; i++) {
                        switch (userList[i].status) {
                            case 'online':
                                if (moment().diff(moment(userList[i].lastActive)) > (10 * 60 * 60 * 1000)) {
                                    users.patch(userList[i]._id, { status: 'away' }).then(patched => {});
                                }
                                break;
                            case 'away':
                            case 'busy':
                                if (moment().diff(moment(userList[i].lastActive)) > (20 * 60 * 60 * 1000)) {
                                    users.patch(userList[i]._id, { status: 'offline' }).then(patched => { skip -= 1; });
                                }
                                break;
                        }

                    }

                    searchAndUpdate(skip + limit);
                }
            });
        }
    }
}



function assignQueueServer(app) {
    appLogger.debug('Assigning Queue Server');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    const servers = app.service('servers');

    servers.find({
        query: {
            'managers.type': 'interactQueue',
            $select: ['_id', 'managers'],
            $limit: maxServers
        }
    })
    .then(async result => {;
        var totalCount = result.data.length;
        var currentlyActiveServer = false;

        for (var i = 0; i < result.data.length; i++) {
            var server = result.data[i];

            for (var j = 0; j < server.managers.length; j++) {
                var serviceId = server.managers[j]._id;

                if (server.managers[j].type == 'interactQueue') {
                    if (server.managers[j].enabled && server.managers[j].active)
                        currentlyActiveServer = true;

                    if (!currentlyActiveServer) {
                        currentlyActiveServer = true;
                        servers.patch(server._id, {
                            $pull: { managers : { type : 'interactQueue' }}
                        })
                        .then(result => {
                            setQueueServer();
                        });
                    }
                }
            }
        }

        if (totalCount == 0)
            setQueueServer();

        function setQueueServer() {
            appLogger.debug('Setting Queue Server');

            servers.find({
                query: {
                    failures: 0,
                    capabilities: 'queueServer',
                    $select: ['_id', 'addressV4', 'addressV6', 'port', 'processID', 'key'],
                    $limit: maxServers
                }
            })
            .then(serverList => {;
                var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                if (serverPick == Math.min(maxServers, serverList.data.length))
                    serverPick--;

                var queueServer = serverList.data[serverPick];
                var serviceKey = unique.generateKey(keyLength);

                servers.patch(queueServer._id, {
                    $push: {
                        managers:{
                            identifier: 'interactQueue' + serverPick,
                            key: serviceKey,

                            type: 'interactQueue',
                            active: false,
                            enabled: true
                        }
                    }
                }).then(queueServerUpdated => {
                    var endpoint = 'https://';
                    if (queueServer.addressV6 != null && queueServer.addressV6 != "" && queueServer.addressV6 != "::1")
                        endpoint += '[' + queueServer.addressV6 + ']';
                    else
                        endpoint += queueServer.addressV4;
                    endpoint += ":" + queueServer.port + "/api/command/queue/clear";

                    var serverKey = queueServer.key || "";

                    request.post({
                        url: endpoint,
                        headers: {
                            'X-Interact-Command-Control': serverKey
                        },
                        form: {}
                    }, function (postError, postResponse, postBody) {
                        if (postError) {
                            appLogger.warn('Unable to clear queue: %o', server._id);
                        }
                        else if (postResponse) {
                            if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                appLogger.debug('Clearing queue successfully: %o', queueServer._id);
                            }
                            else {
                                appLogger.warn('Unable to clear queue - invalid response: %o', queueServer._id);
                            }
                        }
                    });
                });
            });
        }
    });
}




var managingWAInstances = false;

function manageWhatsappInstances(app) {
    appLogger.debug('Managing Whatsapp Instances');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    if (managingWAInstances == false) {
        managingWAInstances = true;

        searchAndManage(0);

        function searchAndManage(skip) {
            var limit = 100;

            const interactions = app.service('interactions');
            const servers = app.service('servers');

            interactions.find({
                query: {
                    'applications.application': 'whatsapp',
                    $select: ['_id', 'team', 'applications'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(interactionResult => {
                if (interactionResult.data.length > 0) {
                    var i = 0;
                    interactionResult.data.forEach(function(interaction) {
                        var clientID = '';
                        var active = false;

                        for (var j = 0; j < interaction.applications.length; j++) {
                            if (interaction.applications[j].application == 'whatsapp') {
                                clientID = interaction.applications[j].user;
                                active = interaction.applications[j].active;
                            }
                        }

                        if (active) {
                            servers.find({
                                query: {
                                    'managers.key': interaction._id,
                                    'managers.type': 'whatsapp',
                                    $select: ['_id', 'managers'],
                                    $limit: maxServers
                                }
                            })
                            .then(async result => {;
                                var totalCount = result.data.length;
                                var currentlyActiveServer = false;

                                for (var k = 0; k < result.data.length; k++) {
                                    var server = result.data[k];

                                    for (var l = 0; l < server.managers.length; l++) {
                                        var serviceId = server.managers[l]._id;

                                        if (server.managers[l].type == 'whatsapp') {
                                            if (server.managers[l].enabled && server.managers[l].active)
                                                currentlyActiveServer = true;

                                            if (!currentlyActiveServer) {
                                                currentlyActiveServer = true;
                                                servers.patch(server._id, {
                                                    $pull: { managers : { _id : serviceId }}
                                                })
                                                .then(result => {
                                                    setWhatsappService(clientID);
                                                });
                                            }
                                        }
                                    }
                                }

                                if (totalCount == 0)
                                    setWhatsappService(clientID);

                                function setWhatsappService(clientID) {
                                    appLogger.debug('Setting Whatsapp Instances');

                                    servers.find({
                                        query: {
                                            failures: 0,
                                            capabilities: 'manageWhatsApp',
                                            $select: ['_id', 'key', 'addressV4', 'port'],
                                            $limit: maxServers
                                        }
                                    })
                                    .then(serverList => {;
                                        var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                                        if (serverPick == Math.min(maxServers, serverList.data.length))
                                            serverPick--;

                                        var whatsappServer = serverList.data[serverPick];

                                        var endpoint = 'https://' + whatsappServer.addressV4 + ':' + whatsappServer.port + '/api/command/whatsapp/restore';
                                        var serverKey = whatsappServer.key;

                                        request.post({
                                            url: endpoint,
                                            headers: {
                                                'X-Interact-Command-Control': serverKey
                                            },
                                            form: {
                                                clientID: clientID
                                            }
                                        }, function (postError, postResponse, postBody) {
                                            if (postError) {
                                                appLogger.error("Error sending restore request for whatsapp service: %o", postError);
                                                appLogger.error('%o', whatsappServer);
                                            }
                                            else if (postResponse) {
                                                if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                                    appLogger.error("Successfully sent restore request for whatsapp service");
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        }

                        if (i + 1 == interactionResult.data.length) {
                            searchAndManage(skip + limit);
                        }

                        i++;
                    });
                }
                else {
                    managingWAInstances = false;
                }
            });
        }
    }
}



var managingDCInstances = false;

function manageDiscordInstances(app) {
    appLogger.debug('Managing Discord Instances');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    if (managingDCInstances == false) {
        managingDCInstances = true;

        searchAndManage(0);

        function searchAndManage(skip) {
            var limit = 100;

            const interactions = app.service('interactions');
            const servers = app.service('servers');

            interactions.find({
                query: {
                    'applications.application': 'discord',
                    $select: ['_id', 'team', 'applications'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(interactionResult => {
                if (interactionResult.data.length > 0) {
                    var i = 0;
                    interactionResult.data.forEach(function(interaction) {
                        var clientID = '';
                        var active = false;

                        for (var j = 0; j < interaction.applications.length; j++) {
                            if (interaction.applications[j].application == 'discord') {
                                clientID = interaction.applications[j].public;
                                active = interaction.applications[j].active;
                            }
                        }

                        if (active) {
                            servers.find({
                                query: {
                                    'managers.key': interaction._id,
                                    'managers.type': 'discord',
                                    $select: ['_id', 'managers'],
                                    $limit: maxServers
                                }
                            })
                            .then(async result => {;
                                var totalCount = result.data.length;
                                var currentlyActiveServer = false;

                                for (var k = 0; k < result.data.length; k++) {
                                    var server = result.data[k];

                                    for (var l = 0; l < server.managers.length; l++) {
                                        var serviceId = server.managers[l]._id;

                                        if (server.managers[l].type == 'discord') {
                                            if (server.managers[l].enabled && server.managers[l].active)
                                                currentlyActiveServer = true;

                                            if (!currentlyActiveServer) {
                                                currentlyActiveServer = true;
                                                servers.patch(server._id, {
                                                    $pull: { managers : { _id : serviceId }}
                                                })
                                                .then(result => {
                                                    setDiscordService(clientID);
                                                });
                                            }
                                        }
                                    }
                                }

                                if (totalCount == 0)
                                    setDiscordService(clientID);

                                function setDiscordService(clientID) {
                                    appLogger.debug('Setting Discord Instances');

                                    servers.find({
                                        query: {
                                            failures: 0,
                                            capabilities: 'manageDiscord',
                                            $select: ['_id', 'key', 'addressV4', 'port'],
                                            $limit: maxServers
                                        }
                                    })
                                    .then(serverList => {;
                                        var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                                        if (serverPick == Math.min(maxServers, serverList.data.length))
                                            serverPick--;

                                        var discordServer = serverList.data[serverPick];

                                        var endpoint = 'https://' + discordServer.addressV4 + ':' + discordServer.port + '/api/command/discord/connect';
                                        var serverKey = discordServer.key;

                                        request.post({
                                            url: endpoint,
                                            headers: {
                                                'X-Interact-Command-Control': serverKey
                                            },
                                            form: {
                                                clientID: clientID
                                            }
                                        }, function (postError, postResponse, postBody) {
                                            if (postError) {
                                                appLogger.error("Error sending restore request for discord service: %o", postError);
                                                appLogger.error('%o', discordServer);
                                            }
                                            else if (postResponse) {
                                                if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                                    appLogger.error("Successfully sent restore request for discord service");
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        }

                        if (i + 1 == interactionResult.data.length) {
                            searchAndManage(skip + limit);
                        }

                        i++;
                    });
                }
                else {
                    managingDCInstances = false;
                }
            });
        }
    }
}






var managingSGInstances = false;

function manageSignalInstances(app) {
    appLogger.debug('Managing Signal Instances');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    if (managingSGInstances == false) {
        managingSGInstances = true;

        searchAndManage(0);

        function searchAndManage(skip) {
            var limit = 100;

            const interactions = app.service('interactions');
            const servers = app.service('servers');

            interactions.find({
                query: {
                    'applications.application': 'signal',
                    $select: ['_id', 'team', 'applications'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(interactionResult => {
                if (interactionResult.data.length > 0) {
                    var i = 0;
                    interactionResult.data.forEach(function(interaction) {
                        var clientID = '';
                        var active = false;

                        for (var j = 0; j < interaction.applications.length; j++) {
                            if (interaction.applications[j].application == 'signal') {
                                clientID = interaction.applications[j].user;
                                active = interaction.applications[j].active;
                            }
                        }

                        if (active) {
                            servers.find({
                                query: {
                                    'managers.key': interaction._id,
                                    'managers.type': 'signal',
                                    $select: ['_id', 'managers'],
                                    $limit: maxServers
                                }
                            })
                            .then(async result => {;
                                var totalCount = result.data.length;
                                var currentlyActiveServer = false;

                                for (var k = 0; k < result.data.length; k++) {
                                    var server = result.data[k];

                                    for (var l = 0; l < server.managers.length; l++) {
                                        var serviceId = server.managers[l]._id;

                                        if (server.managers[l].type == 'signal') {
                                            if (server.managers[l].enabled && server.managers[l].active)
                                                currentlyActiveServer = true;

                                            if (!currentlyActiveServer) {
                                                currentlyActiveServer = true;
                                                servers.patch(server._id, {
                                                    $pull: { managers : { _id : serviceId }}
                                                })
                                                .then(result => {
                                                    setSignalService(clientID);
                                                });
                                            }
                                        }
                                    }
                                }

                                if (totalCount == 0)
                                    setSignalService(clientID);

                                function setSignalService(clientID) {
                                    appLogger.debug('Setting Signal Instances');

                                    servers.find({
                                        query: {
                                            failures: 0,
                                            capabilities: 'manageSignal',
                                            $select: ['_id', 'key', 'addressV4', 'port'],
                                            $limit: maxServers
                                        }
                                    })
                                    .then(serverList => {;
                                        var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                                        if (serverPick == Math.min(maxServers, serverList.data.length))
                                            serverPick--;

                                        var signalServer = serverList.data[serverPick];

                                        var endpoint = 'https://' + signalServer.addressV4 + ':' + signalServer.port + '/api/command/signal/connect';
                                        var serverKey = signalServer.key;

                                        request.post({
                                            url: endpoint,
                                            headers: {
                                                'X-Interact-Command-Control': serverKey
                                            },
                                            form: {
                                                clientID: clientID,
                                                interactionID: interaction._id
                                            }
                                        }, function (postError, postResponse, postBody) {
                                            if (postError) {
                                                appLogger.error("Error sending restore request for signal service: %o", postError);
                                                appLogger.error('%o', signalServer);
                                            }
                                            else if (postResponse) {
                                                if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                                    appLogger.error("Successfully sent restore request for signal service");
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        }

                        if (i + 1 == interactionResult.data.length) {
                            searchAndManage(skip + limit);
                        }

                        i++;
                    });
                }
                else {
                    managingSGInstances = false;
                }
            });
        }
    }
}








var managingIGInstances = false;

function manageInstagramInstances(app) {
    appLogger.debug('Managing Instagram Instances');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    if (managingIGInstances == false) {
        managingIGInstances = true;

        searchAndManage(0);

        function searchAndManage(skip) {
            var limit = 100;

            const interactions = app.service('interactions');
            const servers = app.service('servers');

            interactions.find({
                query: {
                    'applications.application': 'instagram',
                    $select: ['_id', 'team', 'applications'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(interactionResult => {
                if (interactionResult.data.length > 0) {
                    var i = 0;
                    interactionResult.data.forEach(function(interaction) {
                        var clientID = '';
                        var active = false;

                        for (var j = 0; j < interaction.applications.length; j++) {
                            if (interaction.applications[j].application == 'instagram') {
                                clientID = interaction.applications[j].username;
                                active = interaction.applications[j].active;
                            }
                        }

                        if (active) {
                            servers.find({
                                query: {
                                    'managers.key': interaction._id,
                                    'managers.type': 'instagram',
                                    $select: ['_id', 'managers'],
                                    $limit: maxServers
                                }
                            })
                            .then(async result => {;
                                var totalCount = result.data.length;
                                var currentlyActiveServer = false;

                                for (var k = 0; k < result.data.length; k++) {
                                    var server = result.data[k];

                                    for (var l = 0; l < server.managers.length; l++) {
                                        var serviceId = server.managers[l]._id;

                                        if (server.managers[l].type == 'instagram') {
                                            if (server.managers[l].enabled && server.managers[l].active)
                                                currentlyActiveServer = true;

                                            if (!currentlyActiveServer) {
                                                currentlyActiveServer = true;
                                                servers.patch(server._id, {
                                                    $pull: { managers : { _id : serviceId }}
                                                })
                                                .then(result => {
                                                    setInstagramService(clientID);
                                                });
                                            }
                                        }
                                    }
                                }

                                if (totalCount == 0)
                                    setInstagramService(clientID);

                                function setInstagramService(clientID) {
                                    appLogger.debug('Setting Instagram Instances');

                                    servers.find({
                                        query: {
                                            failures: 0,
                                            capabilities: 'manageInstagram',
                                            $select: ['_id', 'key', 'addressV4', 'port'],
                                            $limit: maxServers
                                        }
                                    })
                                    .then(serverList => {;
                                        var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                                        if (serverPick == Math.min(maxServers, serverList.data.length))
                                            serverPick--;

                                        var instagramServer = serverList.data[serverPick];

                                        var endpoint = 'https://' + instagramServer.addressV4 + ':' + instagramServer.port + '/api/command/instagram/connect';
                                        var serverKey = instagramServer.key;

                                        request.post({
                                            url: endpoint,
                                            headers: {
                                                'X-Interact-Command-Control': serverKey
                                            },
                                            form: {
                                                clientID: clientID,
                                                interactionID: interaction._id
                                            }
                                        }, function (postError, postResponse, postBody) {
                                            if (postError) {
                                                appLogger.error("Error sending restore request for instagram service: %o", postError);
                                                appLogger.error('%o', instagramServer);
                                            }
                                            else if (postResponse) {
                                                if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                                    appLogger.error("Successfully sent restore request for instagram service");
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        }

                        if (i + 1 == interactionResult.data.length) {
                            searchAndManage(skip + limit);
                        }

                        i++;
                    });
                }
                else {
                    managingIGInstances = false;
                }
            });
        }
    }
}






var managingLIInstances = false;

function manageLinkedInInstances(app) {
    appLogger.debug('Managing LinkedIn Instances');
    const commandSettings = app.get('command');
    const maxServers = commandSettings.maxServers;

    if (managingLIInstances == false) {
        managingLIInstances = true;

        searchAndManage(0);

        function searchAndManage(skip) {
            var limit = 100;

            const interactions = app.service('interactions');
            const servers = app.service('servers');

            interactions.find({
                query: {
                    'applications.application': 'linkedin',
                    $select: ['_id', 'team', 'applications'],
                    $limit: limit,
                    $skip: skip
                }
            })
            .then(interactionResult => {
                if (interactionResult.data.length > 0) {
                    var i = 0;
                    interactionResult.data.forEach(function(interaction) {
                        var clientID = '';
                        var active = false;

                        for (var j = 0; j < interaction.applications.length; j++) {
                            if (interaction.applications[j].application == 'linkedin') {
                                clientID = interaction.applications[j].username;
                                active = interaction.applications[j].active;
                            }
                        }

                        if (active) {
                            servers.find({
                                query: {
                                    'managers.key': interaction._id,
                                    'managers.type': 'linkedin',
                                    $select: ['_id', 'managers'],
                                    $limit: maxServers
                                }
                            })
                            .then(async result => {;
                                var totalCount = result.data.length;
                                var currentlyActiveServer = false;

                                for (var k = 0; k < result.data.length; k++) {
                                    var server = result.data[k];

                                    for (var l = 0; l < server.managers.length; l++) {
                                        var serviceId = server.managers[l]._id;

                                        if (server.managers[l].type == 'linkedin') {
                                            if (server.managers[l].enabled && server.managers[l].active)
                                                currentlyActiveServer = true;

                                            if (!currentlyActiveServer) {
                                                currentlyActiveServer = true;
                                                servers.patch(server._id, {
                                                    $pull: { managers : { _id : serviceId }}
                                                })
                                                .then(result => {
                                                    setLinkedInService(clientID);
                                                });
                                            }
                                        }
                                    }
                                }

                                if (totalCount == 0)
                                    setLinkedInService(clientID);

                                function setLinkedInService(clientID) {
                                    appLogger.debug('Setting LinkedIn Instances');

                                    servers.find({
                                        query: {
                                            failures: 0,
                                            capabilities: 'manageLinkedIn',
                                            $select: ['_id', 'key', 'addressV4', 'port'],
                                            $limit: maxServers
                                        }
                                    })
                                    .then(serverList => {;
                                        var serverPick = Math.round(Math.random() * Math.min(maxServers, serverList.data.length));
                                        if (serverPick == Math.min(maxServers, serverList.data.length))
                                            serverPick--;

                                        var linkedInServer = serverList.data[serverPick];

                                        var endpoint = 'https://' + linkedInServer.addressV4 + ':' + linkedInServer.port + '/api/command/linkedin/connect';
                                        var serverKey = linkedInServer.key;

                                        request.post({
                                            url: endpoint,
                                            headers: {
                                                'X-Interact-Command-Control': serverKey
                                            },
                                            form: {
                                                clientID: clientID
                                            }
                                        }, function (postError, postResponse, postBody) {
                                            if (postError) {
                                                appLogger.error("Error sending restore request for LinkedIn service: %o", postError);
                                                appLogger.error('%o', linkedInServer);
                                            }
                                            else if (postResponse) {
                                                if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                                    appLogger.error("Successfully sent restore request for LinkedIn service");
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        }

                        if (i + 1 == interactionResult.data.length) {
                            searchAndManage(skip + limit);
                        }

                        i++;
                    });
                }
                else {
                    managingLIInstances = false;
                }
            });
        }
    }
}



function cleanUpManagers(app) {
    appLogger.debug('Attempting server clean up');

    const servers = app.service('servers');
    const interactions = app.service('interactions');

    servers.find({
        query: {
            key: app.commandKey,
            $select: ['_id', 'key', 'managers'],
            $limit: 1
        }
    })
    .then(async result => {
        if (result.data.length > 0) {
            var server = result.data[0];

            var managers = server.managers;
            for (var i = 0; i < managers.length; i++) {
                var manager = managers[i];
                appLogger.debug('Attempting server clean up - reviewing %o and manager %o', server.key, manager.type);

                var validInteraction = mongoose.Types.ObjectId.isValid(manager.key);
                var interaction = null;
                if (validInteraction) {
                    interaction = await interactions.get(manager.key, {
                        query: {
                            $select: ['_id', 'team', 'applications']
                        }
                    })
                    .catch(error => {
                        return { applications: [] }
                    });
                }

                var application = null;
                if (interaction != null) {
                    for (var j = 0; j < interaction.applications.length; j++) {
                        if (interaction.applications[j].application == manager.type) {
                            application = interaction.applications[j];
                        }
                    }
                }

                if (validInteraction && (application == null || !application.active)) {
                    appLogger.debug('Attempting server clean up - cleaning on %o manager %o', server.key, manager.type);

                    var findResult = await servers.find({
                        query: {
                            'managers.key': manager.key,
                            'managers.active': true
                        }
                    });

                    if (findResult.data.length > 0) {
                        await servers.patch(server._id, {
                            'managers.$.active': false
                        }, {
                            query: {
                                'managers.key': manager.key
                            }
                        })
                        .catch(error => {
                            appLogger.debug('Service %o no longer exists on %o', manager.type, server.key);
                        });

                        switch (manager.type) {
                            case 'discord':
                            case 'signal':
                            case 'instagram':
                            case 'linkedin':
                            case 'whatsapp':
                                request.post({
                                    url: "https://localhost:4343/channels/" + manager.type + "/disconnect",
                                    headers: {},
                                    form: {
                                        interactionID: manager.key
                                    },
                                    json: true
                                }, function (postError, postResponse, postBody) {
                                    if (postError) {
                                        appLogger.error("Error sending disconnect request for " + manager.type + " manager: %o", postError);
                                    } else if (postResponse) {
                                        if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                            appLogger.error("Successfully sent disconnect request for " + manager.type + " manager");
                                        }
                                    }
                                });
                                break;
                            default:
                        }
                    }
                }
            }
        }
    });
}
