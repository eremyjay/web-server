
const uuid = require('uuid');
const uuidv4 = uuid.v4;

const uniqid = require('uniqid');

const cryptoRandom = require('crypto-random-string');
/*
type
Type: string
Default: 'hex'
Values: 'hex' | 'base64' | 'url-safe' | 'numeric' | 'distinguishable'
 */


module.exports = {
    generateUUID: generateUUID,
    generateKey: generateKey,
    generateReference: generateReference,
    generateToken: generateToken,
    generateUniqueID: generateUniqueID,
    generatePassword: generatePassword,
    generateBase64: generateBase64,
    generateHex: generateHex
}




function generateUUID() {
    var result = uuidv4();

    return result; // 32 chars + hyphens
}

function generateUniqueID(pre, suf) {
    var prefix = pre || "";
    var suffix = suf || "";
    return prefix + uniqid() + suffix; // 18 chars all lower case
}


function generateKey(len) {
    var length = len || 32;
    return outputKey('ft_knox_pw', length);
}

function generateReference(len) {
    var length = len || 8;
    var result = cryptoRandom({ length: length, type: 'distinguishable' });

    return result;
}

function generateToken(len) {
    var length = len || 32;
    var result = cryptoRandom({ length: length, type: 'url-safe' });

    return result;
}

function generateBase64(len) {
    var length = len || 32;
    var result = cryptoRandom({ length: length, type: 'base64' });

    return result;
}

function generateHex(len) {
    var length = len || 32;
    var result = cryptoRandom({ length: length, type: 'hex' });

    return result;
}

function generatePassword(len) {
    return generateKey(len);
}




// credit https://github.com/circlecell/randomkeygen.com/blob/master/js/index.js

const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const numbers = '1234567890';
const special = '`~!@#$%^&*()-=_+[]{}|;:,./<>?';
const hex = '123456789ABCDEF';

function random() {
    return Math.random();
}

function keyGen(length, useLowerCase, useUpperCase, useNumbers, useSpecial, useHex) {
    var chars = '';
    var key = '';

    if (useLowerCase) chars += lowerCase;
    if (useUpperCase) chars += upperCase;
    if (useNumbers) chars += numbers;
    if (useSpecial) chars += special;
    if (useHex) chars += hex;

    for (var i = 0; i < length; i++) {
        key += chars[Math.floor(random() * chars.length)];
    }

    return key;
}

function outputKey(strength, length) {
    switch (strength) {
        case 'decent_pw':
            return keyGen(length || 10, true, true, true, false, false);
        case 'strong_pw':
            return keyGen(length || 15, true, true, true, true, false);
        case 'ft_knox_pw':
            return keyGen(length || 30, true, true, true, true, false);
        case 'ci_key':
            return keyGen(length || 32, true, true, true, false, false);
        case '160_wpa':
            return keyGen(length || 20, true, true, true, true, false);
        case '504_wpa':
            return keyGen(length || 63, true, true, true, true, false);
        case '64_wep':
            return keyGen(length || 5, false, false, false, false, true);
        case '128_wep':
            return keyGen(length || 13, false, false, false, false, true);
        case '152_wep':
            return keyGen(length || 16, false, false, false, false, true);
        case '256_wep':
            return keyGen(length || 29, false, false, false, false, true);
        default:
            throw Error(`No such strength "${strength}"`);
    }
}



/*

function generateUUID() {
    var d = new Date().getTime();

    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c)
    {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });

    return uuid;
}




export function generateKey(length) {
    var ALPHABET = 'abdegiklmnopqrvwxyz0123456789';

    var ID_LENGTH = length;

    var rtn = '';

    rtn += ALPHABET.charAt(Math.floor(Math.random() * (ALPHABET.length / 2)));

    for (var i = 1; i < ID_LENGTH; i++)
        rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));

    return rtn;
}




export function generateReference() {
    var charlist = "abdfgjklmnpqrstwxyz";

    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = now - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var dayOfYear = Math.round(diff / oneDay);
    var timeToday = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    var milliseconds = div(now.getMilliseconds(), 19);

    var pos1n = mod(div(dayOfYear, 19), 19);
    var pos2n = mod(dayOfYear, 19);
    var pos3n = mod(div(div(div(timeToday, 19), 19), 19), 19);
    var pos4n = mod(div(div(timeToday, 19), 19), 19);
    var pos5n = mod(div(timeToday, 19), 19);
    var pos6n = mod(timeToday, 19);
    var pos7n = mod(milliseconds, 19);

    var pos1 = charlist.substr(pos1n, 1);
    var pos2 = charlist.substr(pos2n, 1);
    var pos3 = charlist.substr(pos3n, 1);
    var pos4 = charlist.substr(pos4n, 1);
    var pos5 = charlist.substr(pos5n, 1);
    var pos6 = charlist.substr(pos6n, 1);
    var pos7 = charlist.substr(pos7n, 1);

    return pos1 + pos2 + pos3 + pos4 + pos5 + pos6 + pos7;
}

 */


// https://github.com/grantcarthew/awesome-unique-id