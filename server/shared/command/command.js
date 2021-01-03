const appLogger = global.appLogger || require('winston').createLogger();

const request = require('postman-request');
const CronJob = require('cron').CronJob;

const unique = require('../../shared/unique.js');


// TODO: Handle all commands using zeromq

var heartbeat = null;
var managersFrequent = null;
var managersInfrequent = null;

var maxServers = 100;
var maxFailures = 3;

var keyLength = 32;


module.exports = {
    setKey: function() {
        return unique.generateKey(keyLength);
    },
    init: function(app, managers, fixedCommandKey) {
        app.commandKey = fixedCommandKey || unique.generateKey(keyLength);

        const commandSettings = app.get('command');

        var heartbeatTime = commandSettings.heartbeatTime;
        var managersRefreshTime = commandSettings.managersRefreshTime;
        var managersInfrequentRefreshTime = commandSettings.managersInfrequentRefreshTime;

        maxServers = commandSettings.maxServers;
        maxFailures = commandSettings.maxFailures;

        const servers = app.service('servers');

        heartbeat = new CronJob('*/' + heartbeatTime + ' * * * *', function() {
            servers.find({
                query: {
                    // failures: 0,
                    $select: ['_id', 'key'],
                    $limit: 1,
                    $sort: { createdAt: -1 }
                }
            })
            .then(serverList => {;
                appLogger.debug('Running heartbeat checks');
                if (serverList.data.length > 0) {
                    performHeartbeat(app, serverList.data[0].key);
                }
            });
        });

        managersFrequent = new CronJob('*/' + managersRefreshTime + ' * * * *', function() {
            servers.find({
                query: {
                    failures: 0,
                    $select: ['_id', 'key'],
                    $limit: 1,
                    $sort: { createdAt: -1 }
                }
            })
            .then(serverList => {;
                appLogger.debug('Running regular managers');
                if (serverList.data.length > 0 && app.commandKey == serverList.data[0].key) {
                    managers.runFrequentManagers(app);
                }
            });
        });

        managersInfrequent = new CronJob('*/' + managersInfrequentRefreshTime + ' * * * *', function() {
            servers.find({
                query: {
                    failures: 0,
                    $select: ['_id', 'key'],
                    $limit: 1,
                    $sort: { createdAt: -1 }
                }
            })
            .then(serverList => {;
                appLogger.debug('Running infrequent managers');
                if (serverList.data.length > 0 && app.commandKey == serverList.data[0].key) {
                    managers.runInfrequentManagers(app);
                }
            });
        });

        var data = {
            machineID: app.machineID,
            addressV4: app.network.addressV4,
            addressV6: app.network.addressV6,
            port: app.network.port,
            processID: app.processID,
            capabilities: managers.getCapabilities(),
            key: app.commandKey,
            failures: 0,
            managers: []
        };

        servers.find({
            query: data
        })
        .then(result => {
            if (result.data.length > 0) {
                servers.patch(result._id, data)
                .then(result => {;
                    heartbeat.start();
                    managers.initManagers(app);
                    managersFrequent.start();
                    managersInfrequent.start();
                    appLogger.info("Started Command Control:");
                    appLogger.info('%o', data);
                })
                .catch(error => {
                    appLogger.warn('Server already removed: %o', result._id);
                });
            }
            else {
                servers.create(data)
                .then(result => {;
                    heartbeat.start();
                    managers.initManagers(app);
                    managersFrequent.start();
                    managersInfrequent.start();
                    appLogger.info("Started Command Control:");
                    appLogger.info('%o', data);
                });
            }
        });
    }
};



function performHeartbeat(app, sentinelKey) {
    const servers = app.service('servers');

    servers.find({
        query: {
            $select: ['_id', 'addressV4', 'addressV6', 'port', 'processID', 'key', 'failures'],
            $limit: maxServers
        }
    })
    .then(async result => {;
        for (var i = 0; i < result.data.length; i++) {
            var server = result.data[i];

            // Define endpoint
            var endpoint = 'https://';
            if (server.addressV6 != null && server.addressV6 != "" && server.addressV6 != "::1")
                endpoint += '[' + server.addressV6 + ']';
            else
                endpoint += server.addressV4;
            endpoint += ":" + server.port + "/api/command/status/ping";

            var serverKey = server.key || "";

            ping(endpoint, server);

            function ping(endpoint, server) {
                appLogger.debug("Attempting command ping: %o", endpoint);
                request.post({
                    url: endpoint,
                    headers: {
                        'X-Interact-Command-Control': serverKey
                    },
                    form: {}
                }, function (postError, postResponse, postBody) {
                    try {
                        if (postError) {
                            appLogger.warn("Error sending ping: %o", postError);

                            if ((parseInt(server.failures) + 1) < maxFailures) {
                                if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                    servers.patch(server._id, {failures: (parseInt(server.failures) + 1)})
                                    .then(resultServer => {
                                        appLogger.warn('%o', resultServer);
                                    })
                                    .catch(error => {
                                        appLogger.warn('Server already removed: %o', server._id);
                                    });
                                }
                            }
                            else {
                                if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                    servers.remove(server._id)
                                    .catch(error => {
                                        appLogger.warn('Server already removed: %o', server._id);
                                    });
                                }
                            }
                        }
                        else if (postResponse) {
                            if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                try {
                                    var data = JSON.parse(postBody);

                                    if (data.status == 'ok') {
                                        if (data.addressV4 != server.addressV4 || data.addressV6 != server.addressV6 ||
                                            data.port != server.port /* || data.processID != server.processID */) {
                                            if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                                appLogger.warn('Server changed - removing:');
                                                appLogger.warn('%o', server);
                                                servers.remove(server._id)
                                                .catch(error => {
                                                    appLogger.warn('Server already removed: %o', server._id);
                                                });
                                            }
                                        }
                                        else {
                                            if (server.failures != 0) {
                                                if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                                    servers.patch(server._id, { failures: 0 })
                                                    .catch(error => {
                                                        appLogger.warn('Server already removed: %o', server._id);
                                                    });
                                                }
                                            }
                                            else
                                                appLogger.debug("Ping successfully completed: %o", endpoint);
                                        }
                                    }
                                    else
                                        appLogger.debug("Data issue with ping response: %o, %o", endpoint, data);
                                }
                                catch (err) {
                                    appLogger.warn("Error sending ping: %o", err);

                                    if ((parseInt(server.failures) + 1) < maxFailures) {
                                        if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                            servers.patch(server._id, {failures: (parseInt(server.failures) + 1)})
                                            .then(resultServer => {
                                                appLogger.warn('%o', resultServer);
                                            })
                                            .catch(error => {
                                                appLogger.warn('Server already removed: %o', server._id);
                                            });
                                        }
                                    }
                                    else {
                                        if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                            servers.remove(server._id)
                                            .catch(error => {
                                                appLogger.warn('Server already removed: %o', server._id);
                                            });
                                        }
                                    }
                                }
                            }
                            else {
                                appLogger.warn("Keys do not match - failure");

                                if ((parseInt(server.failures) + 1) < maxFailures) {
                                    if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                        servers.patch(server._id, {failures: (parseInt(server.failures) + 1)})
                                        .then(resultServer => {
                                            appLogger.warn('%o', resultServer);
                                        })
                                        .catch(error => {
                                            appLogger.warn('Server already removed: %o', server._id);
                                        });
                                    }
                                }
                                else {
                                    if (app.commandKey == sentinelKey || serverKey == sentinelKey) {
                                        servers.remove(server._id)
                                        .catch(error => {
                                            appLogger.warn('Server already removed: %o', server._id);
                                        });
                                    }
                                }
                            }
                        }
                    }
                    catch (error) {}
                });
            }
        }
    });
}

