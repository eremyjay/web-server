const { createLogger, format, transports } = require('winston');

const { LoggingWinston } = require('@google-cloud/logging-winston');

const MachineID = require('node-machine-id');
const networkAddress = require('../../shared/connection/networking.js');

// Configure the Winston logger. For the complete documentation see https://github.com/winstonjs/winston
module.exports = {
    init: init,
    configure: configure
}

function init() {
    return createLogger({
        transports: [
            new transports.Console({
                level: 'info',
                prettyPrint: function (object) {
                    return JSON.stringify(object);
                },
                format: format.combine(
                    format.timestamp(),
                    format.splat(),
                    format.printf(info => {
                        // var parts = info.filename.split('/');
                        // var file = parts[parts.length - 2] + '/' + parts.pop();

                        return `${info.timestamp}: ${info.message}`;
                    }),
                    format.colorize(),
                    format.align()
                ),
            })
        ]
    });
}

function configure(logger, app) {
    logger['serverMachineID'] = MachineID.machineIdSync();
    logger['serverAddressV4'] = networkAddress.ipv4();
    logger['serverAddressV6'] = networkAddress.ipv6();
    logger['serverPort'] = app.get('port');

    if (app.get('env') === 'development') {
        logger.configure({
            transports: [
                new transports.Console({
                    // To see more detailed errors, change this to 'debug'
                    level: app.get('logger').level,
                    prettyPrint: function (object) {
                        return JSON.stringify(object);
                    },
                    format: format.combine(
                        format.timestamp(),
                        format.splat(),
                        format.printf(info => {
                            // var parts = info.filename.split('/');
                            // var file = parts[parts.length - 2] + '/' + parts.pop();

                            return `[${logger.serverMachineID.slice(-4)} ${logger.serverAddressV4}:${logger.serverPort}] ${info.timestamp}: ${info.message}`;
                        }),
                        format.colorize(),
                        format.align()
                    ),
                })
            ]
        });
    }

    if (app.get('env') === 'production') {
        const gCloudWinston = new LoggingWinston({
            prefix: `${logger.serverMachineID.slice(-4)} ${logger.serverAddressV4}:${logger.serverPort}`,
            labels: {
                name: 'interact.do',
                // version: '0.1.0'
            },
            serviceContext: {
                service: `interact.do ${logger.serverAddressV4}:${logger.serverPort}`, // required to report logged errors
                // to the Google Cloud Error Reporting
                // console
                // version: 'my-version'
            }
        });

        logger.configure({
            format: format.combine(
                format.splat(),
                format.printf(info => {
                    // var parts = info.filename.split('/');
                    // var file = parts[parts.length - 2] + '/' + parts.pop();

                    return `[${logger.serverMachineID.slice(-4)} ${logger.serverAddressV4}:${logger.serverPort}]: ${info.message}`;
                }),
                format.colorize(),
                format.align()
            ),
            transports: [
                new transports.Console({
                    // To see more detailed errors, change this to 'debug'
                    level: app.get('logger').level,
                    prettyPrint: function (object) {
                        return JSON.stringify(object);
                    },
                    format: format.combine(
                        format.timestamp(),
                        format.splat(),
                        format.printf(info => {
                            // var parts = info.filename.split('/');
                            // var file = parts[parts.length - 2] + '/' + parts.pop();

                            return `[${logger.serverMachineID.slice(-4)} ${logger.serverAddressV4}:${logger.serverPort}]${info.timestamp}: ${info.message}`;
                        }),
                        format.colorize(),
                        format.align()
                    ),
                }),
                gCloudWinston
            ]
        });
    }

    logger['setVariables'] = function(variables) {
        (variables.serverMachineID != null) ? logger['serverMachineID'] = variables.serverMachineID : doNothing();
        (variables.serverAddressV4 != null) ? logger['serverAddressV4'] = variables.serverAddressV4 : doNothing();
        (variables.serverAddressV6 != null) ? logger['serverAddressV6'] = variables.serverAddressV6 : doNothing();
        (variables.serverPort != null) ? logger['serverPort'] = variables.serverPort : doNothing();
        (variables.serverProcessID != null) ? logger['serverProcessID'] = variables.serverProcessID : doNothing();
        (variables.serverWorkerID != null) ? logger['serverWorkerID'] = variables.serverWorkerID : doNothing();
    };

    return logger;
}

function doNothing() {};