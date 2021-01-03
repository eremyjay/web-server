const fs = require('fs');
const OS = require('os');

const spdy = require('spdy');
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const pem = require('pem');

const stickyClusterProcess = require('sticky-cluster');
const stickyClusterNetwork = require('express-sticky-cluster');

const unique = require('../../shared/unique.js');

const MachineID = require('node-machine-id');
const networkAddress = require('../../shared/connection/networking.js');

const CommandControl = require('../../shared/command/command.js');
const Handlers = require('../../shared/command/handlers.js');


/*
console.log("Environment variables:");
console.log(process.env);
*/


module.exports = {
    runServer: runServer
}

async function runServer(app, managersImported, handlersImported) {
    const managers = managersImported || { setKey: function() { return app.get('key') || "no-key" }, init: function() {} };
    const handlers = handlersImported || { init: function() {} };

    const appPort = (app.get('features').ssl) ? app.get('https-port') : app.get('port');
    const clusterEnabled = app.get('features').cluster;
    const clusterMode = app.get('cluster').mode;

    const ssl = app.get('features').ssl;

    const minInstances = app.get('cluster').minimumInstances || 1;
    const maxInstances = app.get('cluster').maximumInstances || Number.MAX_SAFE_INTEGER;

    var stickyClusterNetworkConfig = {};
    var stickyClusterProcessConfig = {};

    var sslCert = await new Promise((resolve) => {
        pem.createCSR({ commonName: 'localhost' }, function(err, csrKey) {
            if (err) { appLogger.error('Error encountered: %o', err); throw err; }
            else {
                pem.createCertificate({ serviceKey: csrKey.clientKey, csr: csrKey.csr, days: (365 * 5), selfSigned: true }, function (err, keys) {
                    if (err) { appLogger.error('Error encountered: %o', err); throw err; }
                    else {
                        resolve({ key: keys.serviceKey, cert: keys.certificate });
                    }
                });
            }

        });
    });

    // Handle development environment
    if (app.get('env') === 'development') {
        // Allow for insecure calls by request.get etc.
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        process.env.GOOGLE_APPLICATION_CREDENTIALS = appRoot + '/' + app.get('google_application_credentials');

        stickyClusterNetworkConfig = {
            workers: Math.max(minInstances, Math.min(OS.cpus().length, maxInstances)),
            respawn: true,
            socket: true,
            proxy_port: appPort,
            worker_port: 4040,
            delay: 0,
            debug: app.get('cluster').debug,
            ssl: {
                secure: ssl,
                certs: sslCert
            },
            // ipfilter: ipfilter(['127.0.0.1', ['192.168.0.1', '192.168.0.200']], {mode: allow, log: false}),
            session: {
                hash: 'interact.jwt.dev',
                ttl: 360000
            },
            logger: appLogger,
            workerListener: function (message) {}
        };

        stickyClusterProcessConfig = {
            concurrency: Math.max(minInstances, Math.min(OS.cpus().length, maxInstances)),
            port: appPort,
            debug: app.get('cluster').debug,
            env: function (index) {
                return { stickycluster_worker_index: index };
            }
        };
    }



    // Handle production environment
    if (app.get('env') === 'production') {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = appRoot + '/' + app.get('google_application_credentials');

        // Allow for insecure calls by request.get etc.
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        stickyClusterNetworkConfig = {
            workers: Math.max(minInstances, Math.min(OS.cpus().length, maxInstances)),
            respawn: true,
            socket: true,
            proxy_port: appPort,
            worker_port: 4040,
            delay: 0,
            debug: app.get('cluster').debug,
            ssl: {
                secure: ssl,
                certs: sslCert
            },
            session: {
                hash: 'interact.jwt.dev',
                ttl: 360000
            },
            logger: appLogger,
            workerListener: function (message) {}
        };

        stickyClusterProcessConfig = {
            concurrency: Math.max(minInstances, Math.min(OS.cpus().length, maxInstances)),
            port: appPort,
            debug: app.get('cluster').debug,
            env: function (index) {
                return { stickycluster_worker_index: index };
            }
        };

    }


    if (clusterEnabled) {
        if (clusterMode == 'network') {
            // Run sticky cluster
            stickyClusterNetwork(stickyClusterNetworkConfig,
                async function (worker, port) {
                    app.machineID = MachineID.machineIdSync();
                    app.network = {
                        addressV4: networkAddress.ipv4(),
                        addressV6: networkAddress.ipv6(),
                        port: port
                    };
                    app.workerID = worker.id;
                    app.processID = worker.process.pid;

                    appLogger.setVariables({
                        serverMachineID: app.machineID,
                        serverWorkerID: app.workerID,
                        serverProcessID: app.processID,
                        serverAddressV4: app.network.addressV4,
                        serverAddressV6: app.network.addressV6,
                        serverPort: app.network.port
                    });

                    CommandControl.init(app, managers);

                    if (port == stickyClusterNetworkConfig.worker_port) { // Only run handlers on master for cluster
                        Handlers.init(app, handlers);
                    }

                    appLogger.info('Worker with machineID ' + app.machineID + ' and worker ID#' + app.workerID + ' process started PID#' + app.processID + " on TCP port %o", port);

                    app.set('port', port);

                    var sslWorkerCert = await new Promise((resolve) => {
                        pem.createCSR({ commonName: networkAddress.ipv4() }, function(err, csrKey) {
                            pem.createCertificate({ serviceKey: csrKey.clientKey, csr: csrKey.csr, days: (365 * 5), selfSigned: true }, function (err, keys) {
                                if (err) { throw err; }
                                resolve({ key: keys.serviceKey, cert: keys.certificate });
                            });
                        });
                    });

                    // SSL only for workers
                    const server = (await setupHttpsServer(app, sslWorkerCert)).listen(port);
                    app.setup(server);

                    return app;
                }
            );

            app.on('error', onError);
            app.on('listening', onListening);

            function onError(error) {
                if (error.syscall !== 'listen')
                    throw error;
                var bind = typeof port === 'string'
                    ? 'Pipe ' + port
                    : 'Port ' + port;
                switch (error.code) {
                    case 'EACCES':
                        appLogger.error('%o', bind + ' requires elevated privileges');
                        process.exit(1);
                        break;
                    case 'EADDRINUSE':
                        appLogger.error('%o', bind + ' is already in use');
                        process.exit(1);
                        break;
                    default:
                        throw error;
                }
            }

            function onListening() {
                var addr = app.address();
                var bind = typeof addr === 'string'
                    ? 'pipe ' + addr
                    : 'port ' + addr.port;
                appLogger.info('Listening on ' + bind + ' PID#' + process.pid);
            }
        }
        else if (clusterMode == 'process') {
            var appServer = (app.get('features').ssl) ? await setupHttpsServer(app) : setupHttpServer(app);

            app.machineID = MachineID.machineIdSync();
            app.processID = process.pid;
            app.network = {
                addressV4: networkAddress.ipv4(),
                addressV6: networkAddress.ipv6(),
                port: appPort
            };

            appLogger.setVariables({
                serverMachineID: app.machineID,
                serverWorkerID: app.workerID,
                serverProcessID: app.processID,
                serverAddressV4: app.network.addressV4,
                serverAddressV6: app.network.addressV6,
                serverPort: app.network.port
            });


            if (cluster.isMaster) {
                var commandKey = unique.generateUniqueID();

                CommandControl.init(app, managers, commandKey);
                Handlers.init(app, handlers);

                startStickyClusterProcess();

                cluster.on('message',function(worker, data) {
                    if (data.request == 'commandKey')
                        worker.send({ commandKey: commandKey });
                });
            }
            else {
                process.send({ request: 'commandKey' });

                process.on('message', function(data) {
                    if (data.commandKey != null) {
                        app.commandKey = data.commandKey;

                        startStickyClusterProcess();
                    }
                });
            }

            function startStickyClusterProcess() {
                stickyClusterProcess(
                    // server initialization function
                    function (callback) {
                        callback(appServer);

                        app.setup(appServer);
                    },
                    // options
                    stickyClusterProcessConfig
                );
            }
        }
        else if (clusterMode == 'basic') {
            app.machineID = MachineID.machineIdSync();
            app.processID = process.pid;
            app.network = {
                addressV4: networkAddress.ipv4(),
                addressV6: networkAddress.ipv6(),
                port: appPort
            };

            if (cluster.isMaster) {
                CommandControl.init(app, managers);
                Handlers.init(app, handlers);

                for (var i = 0; i < OS.cpus().length; i++)
                    cluster.fork();
            }
            else
                runBasicServer(app);

            cluster.on('listening', (worker) => {;
                app.workerID = worker.id;
                app.processID = worker.process.pid;

                appLogger.setVariables({
                    serverMachineID: app.machineID,
                    serverWorkerID: app.workerID,
                    serverProcessID: app.processID,
                    serverAddressV4: app.network.addressV4,
                    serverAddressV6: app.network.addressV6,
                    serverPort: app.network.port
                });
                appLogger.info('Worker with machineID ' + app.machineID + ' and worker ID#' + app.workerID + ' process now listening on PID#' + app.processID);
            });
            cluster.on('exit', (worker) => {;
                appLogger.info('Worker with machineID ' + app.machineID + ' and worker ID#' + app.workerID + ' process failed on PID#' + app.processID + ' restarting...');
            });

            app.workerID = worker.id;
            app.processID = worker.process.pid;
        }
    }
    else {
        await runBasicServer(app);

        app.machineID = MachineID.machineIdSync();
        app.processID = process.pid;
        app.network = {
            addressV4: networkAddress.ipv4(),
            addressV6: networkAddress.ipv6(),
            port: appPort
        };

        appLogger.setVariables({
            serverMachineID: app.machineID,
            serverAddressV4: app.network.addressV4,
            serverAddressV6: app.network.addressV6,
            serverPort: app.network.port
        });
        appLogger.info('Basic server established with machineID ' + app.machineID);

        CommandControl.init(app, managers);
        Handlers.init(app, handlers);
    }
}






async function runBasicServer(app) {
    const appPort = (app.get('features').ssl) ? app.get('https-port') : app.get('port');
    var appServer = (app.get('features').ssl) ? await setupHttpsServer(app) : await setupHttpServer(app);

    appServer.listen(appPort);

    // Call app.setup to initialize
    app.setup(appServer);
}



function setupHttpServer(app) {
    const host = app.get('host');
    const appPort = (app.get('features').ssl) ? app.get('https-port') : app.get('port');

    if (app.get('features').spdy) {
        var spdyOptions = {
            spdy: {
                protocols: [ 'http/1.1' ],
                plain: true,
                ssl: false
            },
            key: fs.readFileSync('cert/localhost/localhost.key'),
            cert: fs.readFileSync('cert/localhost/localhost.crt')
        }

        // HTTPS server setup
        const httpServer = spdy.createServer(spdyOptions, app);

        process.on('unhandledRejection', (reason, p) => {;
            appLogger.error('Unhandled Rejection at: Promise %o %o', p, reason);
        });

        httpServer.on('listening', () => {;
            appLogger.info('Feathers application started on https://%s:%d', host, appPort);
        });

        return httpServer;
    }
    else
        return http.createServer(app);
}


async function setupHttpsServer(app, customSslCert) {
    const host = app.get('host');
    const appPort = (app.get('features').ssl) ? app.get('https-port') : app.get('port');

    var sslCert = customSslCert || await new Promise((resolve) => {
        pem.createCSR({ commonName: networkAddress.ipv4() }, function(err, csrKey) {
            pem.createCertificate({ serviceKey: csrKey.clientKey, csr: csrKey.csr, days: (365 * 5), selfSigned: true }, function (err, keys) {
                if (err) { throw err; }
                resolve({ key: keys.serviceKey, cert: keys.certificate });
            });
        });
    });

    if (app.get('features').spdy) {
        var spdyOptions = {
            spdy: {
                protocols: [ 'h2', 'spdy/3.1', 'http/1.1' ],
                plain: false,
                ssl: true
            },
            key: sslCert.key,
            cert: sslCert.cert
        }

        // HTTPS server setup
        const httpsServer = spdy.createServer(spdyOptions, app);

        process.on('unhandledRejection', (reason, p) => {;
            appLogger.error('Unhandled Rejection at: Promise %o %o', p, reason);
        });

        httpsServer.on('listening', () => {;
            appLogger.info('Feathers application started on https://%s:%d', host, appPort);
        });

        return httpsServer;
    }
    else {
        const options = {
            key: sslCert.key,
            cert: sslCert.cert,
            enableTrace: false,
            requestCert: false
        };

        const httpsServer = https.createServer(options, app);

        process.on('unhandledRejection', (reason, p) => {;
            appLogger.error('Unhandled Rejection at: Promise %o %o', p, reason);
        });

        httpsServer.on('listening', () => {;
            appLogger.info('Feathers application started on https://%s:%d', host, appPort);
        });

        return httpsServer;
    }
}

