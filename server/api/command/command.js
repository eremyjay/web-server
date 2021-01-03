const appLogger = global.appLogger || require('winston').createLogger();

const authenticate = require('../../middleware/header-auth.js');


module.exports = function (importedCommands) {
    return function() {
        const app = this;
        var commands = importedCommands;

        // Required receivers
        commands['status'] = checkStatusReceiver;

        app.post('/api/command/:manager/:instruction',
            authenticate(app, 'X-Interact-Command-Control', 'commandKey'),
            function (req, res, next) {
                var manager = req.params.manager;
                var instruction = req.params.instruction;

                var data = req.body;

                switcher(app, manager, instruction, data, req, res, next);
            });

        function add(_case, fn) {
            commands[_case] = commands[_case] || [];
            commands[_case].push(fn);
        }

        function switcher(app, manager, instruction, data, req, res, next) {
            if (commands[manager])
                commands[manager](app, instruction, data, res, req, next);
        }
    }
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

            // cleanUpServer(app);

            break;
    }
    // break;
}
