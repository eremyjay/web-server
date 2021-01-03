const mongoose = require('mongoose');
// servers-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
    const mongooseClient = app.get('mongooseClient');

    const {Schema} = mongoose;

    const Managers = new Schema({
        identifier: { type: String },
        key: { type: String },
        type: { type: String },

        active: { type: Boolean },
        enabled: { type: Boolean }
    }, {
        timestamps: true
    });

    const servers = new Schema({
        machineID: { type: String, required: true },
        addressV4: { type: String },
        addressV6: { type: String },
        port: { type: Number },
        processID: { type: String },

        failures: { type: Number },

        key: { type: String },

        managers: [{ type: Managers }],

        capabilities: [{ type: String }]
    }, {
        timestamps: true
    });

    // This is necessary to avoid model compilation errors in watch mode
    // see https://github.com/Automattic/mongoose/issues/1251
    try {
        return mongooseClient.model('servers');
    }
    catch (e) {
        return mongooseClient.model('servers', servers);
    }
};
