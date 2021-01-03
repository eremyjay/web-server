const os = require('os');
const ip6addr = require('ip6addr');

function pickInterfaceAddress(interfaces, family) {
    for (var i in interfaces) {
        for (var j = interfaces[i].length - 1; j >= 0; j--) {
            var face = interfaces[i][j];
            var reachable = family === 'IPv4' || face.scopeid === 0;
            if (!face.internal && face.family === family && reachable)
                return face.address;
        }
    }
    return family === 'IPv4' ? '127.0.0.1' : '::1';
}

function pickInterfaceNetmask(interfaces, family) {
    for (var i in interfaces) {
        for (var j = interfaces[i].length - 1; j >= 0; j--) {
            var face = interfaces[i][j];
            var reachable = family === 'IPv4' || face.scopeid === 0;
            if (!face.internal && face.family === family && reachable)
                return face.netmask;
        }
    }
    return family === 'IPv4' ? '127.0.0.1' : '::1';
}

function pickInterfaceCIDR(interfaces, family) {
    for (var i in interfaces) {
        for (var j = interfaces[i].length - 1; j >= 0; j--) {
            var face = interfaces[i][j];
            var reachable = family === 'IPv4' || face.scopeid === 0;
            if (!face.internal && face.family === family && reachable)
                return face.cidr;
        }
    }
    return family === 'IPv4' ? '127.0.0.1' : '::1';
}

function reduceInterfaces(interfaces, iface) {
    var ifaces = {};
    for (var i in interfaces) {
        if (i === iface) ifaces[i] = interfaces[i];
    }
    return ifaces;
}

function ipv4(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceAddress(interfaces, 'IPv4');
}

function ipv4Netmask(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceNetmask(interfaces, 'IPv4');
}

function ipv4CIDR(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceCIDR(interfaces, 'IPv4');
}

function ipv6(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceAddress(interfaces, 'IPv6');
}

function ipv6Netmask(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceNetmask(interfaces, 'IPv6');
}

function ipv6CIDR(iface) {
    var interfaces = os.networkInterfaces();
    if (iface) interfaces = reduceInterfaces(interfaces, iface);
    return pickInterfaceCIDR(interfaces, 'IPv6');
}

function inCIDR(cidr, address) {
    var cidrObject = ip6addr.createCIDR(cidr);
    return cidrObject.contains(address);
}



ipv4.ipv4 = ipv4;
ipv4.ipv6 = ipv6;
ipv4.ipv4Netmask = ipv4Netmask;
ipv4.ipv6Netmask = ipv6Netmask;
ipv4.ipv4CIDR = ipv4CIDR;
ipv4.ipv6CIDR = ipv6CIDR;
ipv4.inCIDR = inCIDR;

module.exports = ipv4;