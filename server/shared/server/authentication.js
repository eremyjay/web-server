const AuthenticationService = require('@feathersjs/authentication').AuthenticationService;

const { JWTStrategy } = require('@feathersjs/authentication');
const { LocalStrategy } = require('@feathersjs/authentication-local');
const { expressOauth, OAuthStrategy } = require('@feathersjs/authentication-oauth');

const base64 = require('node-base64-image');
const base64Options = {
    string: true,
    local: false
};

const Twitter = require('twitter');

const request = require('postman-request');

const unique = require('../../shared/unique.js');


module.exports = app => {
    const authService = new AuthenticationService(app);

    authService.register('jwt', new JWTStrategy());
    authService.register('local', new LocalStrategy());

    // Open Auth
    if (app.get('authentication').oauth.google.enabled)
        authService.register('google', new GoogleStrategy());
    if (app.get('authentication').oauth.linkedin2.enabled)
        authService.register('linkedin2', new LinkedInStrategy());
    if (app.get('authentication').oauth.twitter.enabled)
        authService.register('twitter', new TwitterStrategy());
    if (app.get('authentication').oauth.instagram.enabled)
        authService.register('instagram', new InstagramStrategy());
    if (app.get('authentication').oauth.facebook.enabled)
        authService.register('facebook', new FacebookStrategy());
    if (app.get('authentication').oauth.producthunt.enabled)
        authService.register('producthunt', new ProductHuntStrategy());

    app.use('/authentication', authService);
    app.configure(expressOauth({
        expressSession: app.expressSession
    }));
};





class CustomOAuthStrategy extends OAuthStrategy {
    constructor(method) {
        super();
        this.method = method;
    }

    async authenticate (authentication, params) {
        const profile = await this.getProfile(authentication, params);

        var app = this.app;
        var method = this.method;

        var id = profile.id || profile.sub;
        var email = profile.email;
        var name = profile.first_name || profile.localizedFirstName || profile.given_name || profile.name;
        var picture = (profile.profilePicture != null) ? profile.profilePicture['displayImage~'].elements[0].identifiers[0].identifier : (profile.profile_image_url || (profile.picture != null && profile.picture.data != null) ? profile.picture.data.url : (profile.picture));

        var user = {};

        if (profile.picture != null) {
            user = await new Promise((resolve) => {
                base64.encode(picture, base64Options, async function(error, result) {
                    var userData = await oAuthVerify(method, app, id, email, name, 'data:image/gif;base64,'+result);
                    resolve(userData);
                });
            });
        }
        else
            user = await oAuthVerify(method, app, id, email, name, "");

        return {
            authentication: { strategy: 'authentication' },
            user: user
        };
    }
}


class GoogleStrategy extends CustomOAuthStrategy {
    constructor() {
        super('google');
    }
}


class InstagramStrategy extends CustomOAuthStrategy {
    constructor() {
        super('instagram');
    }
}



class FacebookStrategy extends CustomOAuthStrategy {
    constructor() {
        super('facebook');
    }

    async getProfile (authResult) {
        // This is the oAuth access token that can be used
        // for Facebook API requests as the Bearer token
        const accessToken = authResult.access_token;

        var data = await new Promise((resolve) => {
            request.get({
                url: 'https://graph.facebook.com/me',
                headers: {
                    authorization: `Bearer ${accessToken}`
                },
                qs: {
                    fields: 'id,name,first_name,email,picture'
                }
            }, function (postError, postResponse, postBody) {
                if (postError) {
                    console.log("Error requesting data: " + postError);
                    return {};
                }
                else if (postResponse) {
                    if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                        try {
                            var data = JSON.parse(postBody);
                            resolve(data);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
            });
        });

        return data;
    }

    async getEntityData(profile) {
        // `profile` is the data returned by getProfile
        var data = await super.getEntityData(profile);

        return data;
    }
}




class TwitterStrategy extends CustomOAuthStrategy {
    constructor() {
        super('twitter');
    }

    async getProfile (authResult) {
        const client = new Twitter({
            consumer_key: this.app.get('authentication').oauth.twitter.key,
            consumer_secret: this.app.get('authentication').oauth.twitter.secret,
            access_token_key: authResult.access_token,
            access_token_secret: authResult.access_secret
        });

        var data = await new Promise((resolve) => {
            client.get('account/verify_credentials.json', {
                    include_email: true,
                    skip_status: true
            }, function (postError, tweets, postBody) {
                if (postError) {
                    console.log("Error requesting data: " + postError);
                }
                else {
                    try {
                        var data = JSON.parse(postBody.body);
                        resolve(data);
                    }
                    catch (err) {
                        console.log(err);
                    }
                }
            });
        });

        return data;
    }

    async getEntityData(profile) {
        // `profile` is the data returned by getProfile
        var data = await super.getEntityData(profile);

        return data;
    }
}


class LinkedInStrategy extends CustomOAuthStrategy {
    constructor() {
        super('linkedin');
    }

    async getProfile (authResult) {
        const accessToken = authResult.access_token;

        var data = await new Promise((resolve) => {
            request.get({
                url: 'https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))',
                headers: {
                    authorization: `Bearer ${accessToken}`
                },
                qs: {
                }
            }, function (postError, postResponse, postBody) {
                if (postError) {
                    console.log("Error requesting data: " + postError);
                    return {};
                }
                else if (postResponse) {
                    if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                        try {
                            var data = JSON.parse(postBody);

                            request.get({
                                url: 'https://api.linkedin.com/v2/clientAwareMemberHandles?q=members&projection=(elements*(primary,type,handle~))',
                                headers: {
                                    authorization: `Bearer ${accessToken}`
                                },
                                qs: {
                                }
                            }, function (postError, postResponse, postBody) {
                                if (postError) {
                                    console.log("Error requesting data: " + postError);
                                    return {};
                                }
                                else if (postResponse) {
                                    if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                                        try {
                                            var emailData = JSON.parse(postBody);
                                            if (emailData.elements != null && emailData.elements.length > 0 && emailData.elements[0]['handle~'] != null)
                                                data.email = emailData.elements[0]['handle~'].emailAddress;
                                            resolve(data);
                                        }
                                        catch (err) {
                                            console.log(err);
                                        }
                                    }
                                }
                            });
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
            });
        });

        return data;
    }

    async getEntityData(profile) {
        // `profile` is the data returned by getProfile
        var data = await super.getEntityData(profile);

        return data;
    }
}


class ProductHuntStrategy extends CustomOAuthStrategy {
    constructor() {
        super('producthunt');
    }

    async getProfile (authResult) {
        // GraphQL
        const accessToken = authResult.access_token;

        var data = await new Promise((resolve) => {
            request.post({
                url: 'https://api.producthunt.com/v2/api/graphql',
                headers: {
                    authorization: `Bearer ${accessToken}`
                },
                qs: {},
                form: {
                    query: "{ " +
                        "  viewer { " +
                        "    user { " +
                        "      name," +
                        "      profileImage" +
                        "    }" +
                        "  }" +
                        "}"

                }
            }, function (postError, postResponse, postBody) {
                if (postError) {
                    console.log("Error requesting data: " + postError);
                    return {};
                }
                else if (postResponse) {
                    if (postResponse.statusCode >= 200 && postResponse.statusCode < 400) {
                        try {
                            var data = JSON.parse(postBody);
                            if (data.data != null && data.data.viewer != null && data.data.viewer.user != null)
                                resolve(data.data.viewer.user);
                            else
                                resolve({});
                        }
                        catch (err) {
                            console.log(err);
                        }
                    }
                }
            });
        });

        return data;
    }

    async getEntityData(profile) {
        // `profile` is the data returned by getProfile
        var data = await super.getEntityData(profile);

        return data;
    }
}


/*

Google:
{ sub: '112809259772507277234',
0|npm  |   name: 'Jeremy de Oliveira-Kumar',
0|npm  |   given_name: 'Jeremy',
0|npm  |   family_name: 'de Oliveira-Kumar',
0|npm  |   picture:
0|npm  |    'https://lh3.googleusercontent.com/a-/AAuE7mC2K1Zs2rmxtqHJ02unwr6_rRi8FQUuETX7UFKW',
0|npm  |   email: 'eremyj@gmail.com',
0|npm  |   email_verified: true,
0|npm  |   locale: 'en' }



 */


async function oAuthVerify(type, app, id, email, name, avatar) {
    const users = app.service('users');
    const manageUsers = app.service('manage-users');

    var identifier = {};
    var methodID = type + 'Id';
    identifier[methodID] = id;

    return await new Promise((resolve, reject) => {
        users.find({
            query: identifier
        })
        .then(matches => {;
            // Profile exists
            if (matches.data.length > 0 && matches.data[0][methodID] != null && matches.data[0][methodID] != "") {
                var user = matches.data[0];

                resolve(user);
            }
            // Profile does not exist
            else {
                users.find({
                    query: {
                        email: email
                    }
                })
                .then(result => {;
                    // User exists
                    if (email == null || email == "") {
                        var userProfile = {
                            name: name,
                            avatar: avatar,
                            password: unique.generatePassword(),
                            enabled: true
                        };

                        userProfile[methodID] = id;

                        resolve(userProfile);
                    }
                    else if (result.data.length > 0) {
                        var user = result.data[0];

                        users.patch(user._id, identifier)
                        .then(result => {;
                            resolve(user);
                        });
                    }
                    // User does not exist
                    else {
                        var userProfile = {
                            name: name,
                            email: email,
                            password: unique.generatePassword(),
                            avatar: avatar,
                            enabled: true
                        };

                        userProfile[methodID] = id;

                        manageUsers.create(userProfile)
                        .then(async result => {;
                            var user = result.user;
                            resolve(user);
                        });
                    }
                });
            }
        });
    });
}



