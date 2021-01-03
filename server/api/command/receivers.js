const appLogger = global.appLogger || require('winston').createLogger();

const WhatsappProcessor = require('../../api/channels/whatsapp/whatsapp-processor.js');
const DiscordProcessor = require('../../api/channels/discord/discord-processor.js');
const SignalProcessor = require('../../api/channels/signal/signal-processor.js');
const InstagramProcessor = require('../../api/channels/instagram/instagram-processor.js');
const LinkedInProcessor = require('../../api/channels/linkedin/linkedin-processor.js');


module.exports = {
    checkStatusReceiver: checkStatusReceiver,
    whatsappReceiver: whatsappReceiver,
    discordReceiver: discordReceiver,
    signalReceiver: signalReceiver,
    instagramReceiver: instagramReceiver,
    linkedInReceiver: linkedInReceiver,
    queueReceiver: queueReceiver,
    cleanUpServer: cleanUpServer
}



function checkStatusReceiver(app, instruction, data, res) {
    // case "status":
    switch (instruction) {
        case "ping":
            res.status(200).json({
                status: 'ok',
                addressV4: app.network.addressV4,
                addressV6: app.network.addressV6,
                port: app.network.port,
                processID: app.processID
            });

            cleanUpServer(app);

            break;
    }
    // break;
}

function whatsappReceiver(app, instruction, data, res) {
    const interactions = app.service('interactions');

    // case "whatsapp":
    switch (instruction) {
        case "restore":
            appLogger.info("Restoring Whatsapp Service");

            appLogger.info('Service attempting to restore connection for whatsapp client: ' + data.clientID);
            WhatsappProcessor.connect(app, data.clientID, 'restore');
            break;
        case "send":
            var number = data.number;
            var messageData = data.messageData;
            var interactionID = data.interactionID;
            var whatsappSession = WhatsappProcessor.whatsappServices[interactionID];

            var encKey = Buffer.from(whatsappSession.connection.encKey, 'latin1');
            var macKey = Buffer.from(whatsappSession.connection.macKey, 'latin1');

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(interaction => {;
                    WhatsappProcessor.sendMessage(app, whatsappSession.socket, false, number, encKey, macKey, whatsappSession.clientID, messageData, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "read":
            var number = data.number;
            var interactionID = data.interactionID;
            var mid = data.mid;
            var whatsappSession = WhatsappProcessor.whatsappServices[interactionID];

            var encKey = Buffer.from(whatsappSession.connection.encKey, 'latin1');
            var macKey = Buffer.from(whatsappSession.connection.macKey, 'latin1');

            WhatsappProcessor.markAsRead(whatsappSession.socket, encKey, macKey, whatsappSession.clientID, mid, false, number);
            res.status(200).json({ status: 'ok' });
            break;
        case "typing":
            var number = data.number;
            var typing = data.typing;
            var interactionID = data.interactionID;
            var whatsappSession = WhatsappProcessor.whatsappServices[interactionID];

            var encKey = Buffer.from(whatsappSession.connection.encKey, 'latin1');
            var macKey = Buffer.from(whatsappSession.connection.macKey, 'latin1');

            WhatsappProcessor.setTyping(whatsappSession.socket, encKey, macKey, typing, number);
            res.status(200).json({ status: 'ok' });
            break;
        case "disconnect":
            var interactionID = data.interactionID;

            WhatsappProcessor.disconnect(interactionID);
            appLogger.verbose("Disconnecting whatsapp for interaction: %o", interactionID);
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}

function discordReceiver(app, instruction, data, res) {
    const interactions = app.service('interactions');

    // case "discord":
    switch (instruction) {
        case "connect":
            var clientID = data.clientID;

            DiscordProcessor.connect(app, clientID).then(result => {
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "send":
            var channelID = data.channelID;
            var messageData = data.messageData;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await DiscordProcessor.sendMessage(app, { from: { channel: channelID } }, messageData, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "read":
            DiscordProcessor.markAsRead();
            res.status(200).json({ status: 'ok' });
            break;
        case "typing":
            var channelID = data.channelID;
            var typing = data.typing;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await DiscordProcessor.setTyping(app, { from: { channel: channelID }}, typing, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "disconnect":
            var interactionID = data.interactionID;

            DiscordProcessor.disconnect(interactionID);
            appLogger.verbose("Disconnecting discord for interaction: %o", interactionID);
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}

function signalReceiver(app, instruction, data, res) {
    const interactions = app.service('interactions');

    // case "signal":
    switch (instruction) {
        case "connect":
            var clientID = data.clientID;
            var interactionID = data.interactionID;

            SignalProcessor.connect(app, clientID, interactionID).then(result => {
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "send":
            var userNumber = data.number;
            var messageData = data.messageData;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await SignalProcessor.sendMessage(app, { from: { id: userNumber } }, messageData, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "read":
            SignalProcessor.markAsRead();
            res.status(200).json({ status: 'ok' });
            break;
        case "typing":
            var userNumber = data.number;
            var typing = data.typing;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await SignalProcessor.setTyping(app, { from: { id: userNumber } }, state, interaction);
                    res.status(200).json({ status: 'ok' });
                });
        case "disconnect":
            var interactionID = data.interactionID;

            SignalProcessor.disconnect(interactionID);
            appLogger.verbose("Disconnecting signal for interaction: %o", interactionID);
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}

function instagramReceiver(app, instruction, data, res) {
    const interactions = app.service('interactions');

    // case "instagram":
    switch (instruction) {
        case "connect":
            var clientID = data.clientID;

            InstagramProcessor.connect(app, clientID).then(result => {
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "send":
            var thread = data.thread;
            var messageData = data.messageData;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await InstagramProcessor.sendMessage(app, { from: { channel: thread } }, messageData, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "read":
            var thread = data.thread;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await InstagramProcessor.markAsRead(app, { threadId: thread }, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "typing":
            var thread = data.thread;
            var typing = data.typing;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
                .then(async interaction => {;
                    await InstagramProcessor.setTyping(app, { from: { channel: thread } }, typing, interaction);
                    res.status(200).json({ status: 'ok' });
                });
            break;
        case "disconnect":
            var interactionID = data.interactionID;

            InstagramProcessor.disconnect(interactionID);
            appLogger.verbose("Disconnecting instagram for interaction: %o", interactionID);
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}

function linkedInReceiver(app, instruction, data, res) {
    const interactions = app.service('interactions');

    // case "linkedin":
    switch (instruction) {
        case "connect":
            var clientID = data.clientID;

            LinkedInProcessor.connect(app, clientID).then(result => {
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "send":
            var conversation = data.channel;
            var messageData = data.messageData;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
            .then(async interaction => {;
                await LinkedInProcessor.sendMessage(app, { from: { channel: conversation } }, messageData, interaction);
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "read":
            LinkedInProcessor.markAsRead();
            res.status(200).json({ status: 'ok' });
            break;
        case "typing":
            var thread = data.thread;
            var typing = data.typing;
            var interactionID = data.interactionID;

            interactions.get(interactionID, {
                query: {
                    $select: ['_id', 'team', 'key', 'applications', 'enabled']
                }
            })
            .then(async interaction => {;
                await LinkedInProcessor.setTyping(app, { from: { channel: thread } }, typing, interaction);
                res.status(200).json({ status: 'ok' });
            });
            break;
        case "disconnect":
            var interactionID = data.interactionID;

            LinkedInProcessor.disconnect(interactionID);
            appLogger.verbose("Disconnecting LinkedIn for interaction: %o", interactionID);
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}

function queueReceiver(app, instruction, data, res) {
    // case "queue":
    switch (instruction) {
        case "clear":
            app.queueManager.clear();
            res.status(200).json({ status: 'ok' });
            break;
        case "process":
            app.queueManager.clear();
            res.status(200).json({ status: 'ok' });
            break;
    }
    // break;
}



function cleanUpServer(app) {
    const servers = app.service('servers');

    servers.find({
        query: {
            addressV4: app.network.addressV4,
            addressV6: app.network.addressV6,
            port: app.network.port,
            processID: app.processID,
            $select: ['_id', 'managers']
        }
    })
    .then(result => {
        if (result.data.length > 0) {
            var server = result.data[0];

            for (var i = 0; i < server.managers.length; i++) {
                var service = server.managers[i];

                switch (service.type) {
                    case 'whatsapp':
                        if (WhatsappProcessor.whatsappServices[service.key] == null) {
                            servers.patch(server._id, {
                                $pull: { managers:{ key: service.key } }
                            })
                            .catch(error => {
                                appLogger.warn('Server already removed: %o', server._id);
                            });
                        }
                        break;
                }
            }
        }
    })
    .catch(error => {
        appLogger.warn('Error querying server: %o', error);
    });
}


