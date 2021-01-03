// const unique = require('../shared/unique.js');


module.exports = function () {
    const app = this; // eslint-disable-line no-unused-vars
    var name = app.get('name');

    return function setHeaders(req, res, next) {
        res.header('X-powered-by', name || 'server');
        res.header('server', name || 'server');

        // Defined as part of helmet now
        // res.header('X-Content-Type-Options', 'nosniff');
        // res.header('X-Frame-Options', 'DENY');
        // res.header('X-Xss-Protection', '1'); // - should be set to zero https://github.com/helmetjs/helmet/issues/230

        // https://content-security-policy.com/
        // var nonce = unique.generateHex();
        // Defined as part of helmet now
        /*
        res.header('Content-Security-Policy', "" +
            "default-src 'self'; " +
            "script-src 'self' nonce-" + nonce + " https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://checkout.stripe.com https://www.paypal.com; " +
            "worker-src 'self' blob:; " +
            "connect-src 'self' https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src https: data:; " +
            "object-src 'self'; " +
            "form-action 'self' https:; " +
            "frame-src 'self' https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com; " +
            "frame-ancestors 'none'; " +
            "base-uri 'none'");
         */

        next();
    };
};
