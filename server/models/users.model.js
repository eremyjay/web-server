const mongoose = require('mongoose');
// users-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
    const mongooseClient = app.get('mongooseClient');
    const {Schema} = mongoose;

    const Tracking = new Schema({
        fingerprint: { type: String },
        interactID: { type: String },
        lastLoginAt: { type: Date }
    }, {
        timestamps: true
    });

    const users = new Schema({

        name: {type: String, required: true},
        email: {type: String, required: true, unique: true},
        password: {type: String, required: true},
        avatar: {type: String},

        countryCode: {type: Number},
        phone: {type: Number},

        googleId: {type: String},
        facebookId: {type: String},
        twitterId: {type: String},
        instagramId: {type: String},
        linkedinId: {type: String},

        currentTeam: {type: mongoose.Schema.Types.ObjectId},  // Must be a team id

        // Tutorials that have been completed
        tutorials: [String],

        enabled: {type: Boolean, required: true},
        active: {type: Boolean, required: true},

        // For handling live status
        status: { type: String },
        lastActive: { type: Date },

        // Used for user level authorizations such as enabling a user
        token: {type: String},
        tokenExpiry: {type: Date},

        // Set socket id for live mode
        socket: { type: String },
        spark: { type: String },
        lastSocket: { type: Date },

        // Tracking data
        tracking: [ { type: Tracking } ]
    }, {
        timestamps: true
    });

    return mongooseClient.model('users', users);
};
