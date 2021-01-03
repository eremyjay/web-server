
const clonedeep = require('lodash.clonedeep');
const extend = require('lodash.assignin');
const getRandomValues = require('get-random-values');

module.exports = {
    pad: pad,
    cloneObject: cloneObject,
    formatter: formatter,
    dateTime: dateTime,
    isSearchEngine: isSearchEngine,
    findProp: findProp,
    applyFunc: applyFunc,
    applyFuncAndModifyObject: applyFuncAndModifyObject,
    isOverflown: isOverflown,
    parseDate: parseDate,
    getURLParameter: getURLParameter,
    matchHashPairs: matchHashPairs,
    formatJSON: formatJSON,
    div: div,
    mod: mod,
    rewriteProperties: rewriteProperties,
    queryStringToObject: queryStringToObject,
    objectToQueryString: objectToQueryString,
    base64UrlEncode: base64UrlEncode,
    base64UrlDecode: base64UrlDecode,
    extractEmails: extractEmails,
    mimeType: mimeType,
    numToHex: numToHex,
    hexToNum: hexToNum,
    isFunction: isFunction,
    uuid: uuid
};


function uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}


function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}


function cloneObject(object, merger) {
    var copy = clonedeep(object);

    if (merger != null)
        copy = extend(object, merger);

    return copy;
}


function formatter(format, data) {
    var result = format;
    var regex = /([$]{([a-zA-Z])([a-zA-Z0-9.,$|]+)})/g;

    var matches = null;
    while (matches = regex.exec(result)) {
        switch (matches[2]) {
            case "i":
                if (/,/g.exec(matches[3]) != null) {
                    var separator = matches[3].substring(1);

                    var construct = "";
                    var counter = 0;
                    for (var j = data.length - 1; j >=0; j--) {
                        if (counter != 0 && counter % separator == 0)
                            construct = "," + construct;

                        construct = data[j] + construct;
                        counter++
                    }

                    result = result.replace(matches[1], construct)
                }
                break;
        }
    }

    return result;
}


function dateTime() {
    var currentDate = new Date();
    return currentDate.toISOString()
}

function isSearchEngine(a) {
    var agent = a.toLowerCase();

    var agentList = [
        "baidu",
        "bing",
        "duckduck",
        "googlebot",
        "yahoo",
        "yandex",
        "sogou",
        "exabot",
        "face",
        "amazon",
        "archive.org",
        "ia_archiver"
    ];

    for (var i = 0; i < agentList.length; i++) {
        if ((new RegExp(agentList[i])).test(agent))
            return true;
    }

    return false;
}



function findProp(obj, prop, defval) {
    if (typeof defval == 'undefined') defval = null;
    prop = prop.split('.');
    for (var i = 0; i < prop.length; i++) {
        if(typeof obj[prop[i]] == 'undefined')
            return defval;
        obj = obj[prop[i]];
    }
    return obj;
}


async function applyFunc(obj, func, args) {
    switch (typeof obj) {
        case 'object':
            for (var i in obj) {
                if (obj.hasOwnProperty(i))
                    await applyFunc(obj[i], func, args);
                else
                    await func.apply(obj[i], args);
            }
            break;
        case 'function':
            break;
        default:
            await func.apply(obj, args);
    }
}


async function applyFuncAndModifyObject(obj, func, args) {
    switch (typeof obj) {
        case 'object':
            for (var i in obj) {
                if (obj.hasOwnProperty(i))
                    obj[i] = await applyFuncAndModifyObject(obj[i], func, args);
            }
            break;
        case 'function':
            break;
        default:
            obj = await func.apply(obj, args);
    }

    return obj;
}







function isOverflown(element) {
    return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

// parse a date in yyyy-mm-dd format
function parseDate(input) {
    var parts = input.split('-');
    // new Date(year, month [, day [, hours[, minutes[, seconds[, ms]]]]])
    return new Date(parts[0], parts[1]-1, parts[2]); // Note: months are 0-based
}

// Set Values from Params:
function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + encodeURIComponent(name) + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||""
}

function matchHashPairs(regex, hash, replace_find, replace) {
    var result = {};
    var keys = Object.keys(hash);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = hash[k];

        if (regex.test(k)) {
            if (replace_find != null)
                result[k.replace(replace_find, replace)] = v;
            else
                result[k] = v;
        }
    }

    return result;
}



function formatJSON(json) {
    return json.replace('}}','}\n}').replace('"}','"\n}').replace('{"','{\n"').replace(']}',']\n}').replace(',"',',\n"');
}



function div(x, y) {
    return Math.floor(x/y);
}


function mod(x, y) {
    return x % y;
}

function isFunction(functionToCheck) {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function rewriteProperties(obj, from, to, removeFunctions) {
    var clone = cloneObject(obj);
    var fromRegExp = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

    if (typeof clone !== "object") return clone;

    for (var prop in clone) {
        if (clone.hasOwnProperty(prop)) {
            clone[prop.replace(fromRegExp, to)] = rewriteProperties(clone[prop], from, to);
            if (prop.indexOf(from) > -1) {
                delete clone[prop];
            }
        }
    }

    return clone;
}

function queryStringToObject(data, isUrl) {
    var qString = data;
    if (isUrl) {
        var parts = data.split('?');
        qString = (parts.length > 1) ? parts[1] : "nothing=empty";
    }
    return JSON.parse('{"' + qString.replace(/&/g, '","').replace(/=/g,'":"') + '"}', function(k, value) { return k===""?value:decodeURIComponent(value) })
}


function objectToQueryString(obj) {
    var str = [];
    for (var p in obj)
        if (obj.hasOwnProperty(p)) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
    return str.join("&");
}


function base64UrlEncode(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
}


function base64UrlDecode(str) {
    str = (str + '===').slice(0, str.length + (str.length % 4));
    return str.replace(/-/g, '+').replace(/_/g, '/');
}

function extractEmails(text) {
    return text.match(/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/gi);
}

function mimeType(dataUri) {
    var mimeSearch = dataUri.split(',')[0].match(/[^:\s*]\w+\/[\w-+\d.]+(?=[;| ])/);

    if (mimeSearch == null)
        return null;
    else
        return mimeSearch[0];
}



function numToHex(n) {
    var hexValue = new Number(n).toString(16);
    if (n < 16)
        hexValue = '0' + hexValue;

    return hexValue;
}

function hexToNum(h) { return parseInt('0x' + h); }
