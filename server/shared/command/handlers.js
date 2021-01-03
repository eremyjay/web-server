const appLogger = global.appLogger || require('winston').createLogger();

const stun = require('stun');
const dgram = require('dgram');
const turn = require('node-turn');


module.exports = {
    init: function(app, handlers) {
        handlers.initHandlers(app);
    },
    stunServer: stunServer,
    turnServer: turnServer
};


function stunServer(stunConfig) {
    if (stunConfig.enabled) {
        // https://github.com/nodertc/stun
        const stunSocket = dgram.createSocket('udp4');
        const stunServer = stun.createServer(stunSocket);

        const { STUN_BINDING_RESPONSE, STUN_EVENT_BINDING_REQUEST } = stun.constants;
        const userAgent = `node/${process.version} stun/v1.3.1`;

        stunServer.on(STUN_EVENT_BINDING_REQUEST, (req, rInfo) => {;
            const msg = stun.createMessage(STUN_BINDING_RESPONSE);

            msg.setTransactionID(req.transactionId);
            msg.addXorAddress(rInfo.address, rInfo.port);
            msg.addSoftware(userAgent);

            stunServer.send(msg, rInfo.port, rInfo.address);
        });

        stunSocket.bind(stunConfig.listeningPort, () => {;
            appLogger.info('[stun] server started');
        });
    }
}

function turnServer(turnConfig) {
    if (turnConfig.enabled) {
        // https://github.com/Atlantis-Software/node-turn
        var turnServer = new turn(turnConfig);
        turnServer.start();
        appLogger.info('[turn] server started');
    }
}
