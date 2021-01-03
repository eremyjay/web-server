const appLogger = global.appLogger || require('winston').createLogger();

const moment = require('moment');
const { RateLimiterRedis } = require('rate-limiter-flexible');



module.exports = function () {
    const app = this;

    const rateLimiter = new RateLimiterRedis({
        storeClient: app.redisStore,
        keyPrefix: 'interactlimiter',
        points: 250,
        duration: 1,
        blockDuration: 5,
        inmemoryBlockOnConsumed: 250,
        inmemoryBlockDuration: 5
    });

    const rateLimiterMiddleware = (req, res, next) => {
        rateLimiter.consume(req.ip)
        .then(() => {
            next();
        })
        .catch(() => {
            res.status(429).send('Too Many Requests', "You've made too many failed attempts in a short period of time, please try again later.");
        });
    };

    // app.use(rateLimiterMiddleware);
}
