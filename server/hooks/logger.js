// A hook that logs service method before, after and error

module.exports = function () {
    return function (hook) {
        var message = `${hook.type}: ${hook.path} - Method: ${hook.method}`;

        if (hook.type === 'error') {
            message += `: ${hook.error.message}`;
        }

        if (hook.app.get('env') === 'development') {
            hook.app.logger.silly('%o', message);
            hook.app.logger.silly('hook.data %o', hook.data);
            hook.app.logger.silly('hook.params %o', hook.params);

            if (hook.result) {
                hook.app.logger.silly('hook.result %o', hook.result);
            }
        }

        if (hook.error) {
            hook.app.logger.error('%o', hook.error);
        }
    };
};
