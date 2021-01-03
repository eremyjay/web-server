const appLogger = global.appLogger || require('winston').createLogger();

module.exports = {
    getCapabilities: getCapabilities,
    initManagers: initManagers,
    runFrequentManagers: runFrequentManagers,
    runInfrequentManagers: runInfrequentManagers,
};


function getCapabilities() {
    var capabilities = [

    ];

    return capabilities;
}

function initManagers(app) {
    // Load services here
}

function runFrequentManagers(app) {
    // Run frequent services here
}

function runInfrequentManagers(app) {
    // Run infrequent services here
}
