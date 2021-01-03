const appLogger = global.appLogger || require('winston').createLogger();

// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html

// eslint-disable-next-line no-unused-vars
module.exports = function (options = {}) {
  return async context => {
        context.data.enabled = true;
        context.data.active = false;
        context.data.generateToken = true;
        context.data.sendActivateEmail = true;

    return context;
  };
};
