'use strict';

var Redis = require('redis');
var Hoek = require('hoek');

// Declare internals
var internals = {};

internals.defaults = {
    write: {
        host: '127.0.0.1',
        port: 6379
    },
    read: {
        host: '127.0.0.1',
        port: 6379
    }
};

exports = module.exports = internals.Connection = function(options) {
    Hoek.assert(this.constructor === internals.Connection, 'Redis cache client must be instantiated using new');

    this.settings = Hoek.applyToDefaults(internals.defaults, options);
    this.writeClient = null;
    this.readClient = null;
    this.writeConnected = false;
    this.readConnected = false;
    return this;
};

internals.Connection.prototype.start = function(callback) {
    var self = this;
    if (this.writeClient || this.readClient) {
        return Hoek.nextTick(callback)();
    }

    var writeClient = Redis.createClient(this.settings.write.port, this.settings.write.host);
    var readClient = Redis.createClient(this.settings.read.port, this.settings.read.host);

    // master and slave should share the same password
    if (this.settings.password) {
        writeClient.auth(this.settings.password);
        readClient.auth(this.settings.password);
    }

    // listen to events
    writeClient.on('error', function(err) {
        if (!self.writeClient) {
            writeClient.end();
            return callback(err);
        }

        self.stop();
    });

    readClient.on('error', function(err) {
        if (!self.readClient) {
            readClient.end();
            return callback(err);
        }

        self.stop();
    });

    readClient.once('connect', function() {
        self.readClient = readClient;
        self.readConnected = true;

        if (self.readConnected && self.writeConnected) {
            return callback();
        }
    });

    writeClient.once('connect', function() {
        self.writeClient = writeClient;
        self.writeConnected = true;

        if (self.readConnected && self.writeConnected) {
            return callback();
        }
    });
};

internals.Connection.prototype.stop = function() {
    if (this.writeClient) {
        this.writeClient.removeAllListeners();
        this.writeClient.quit();
        this.writeClient = null;
    }

    if (this.readClient) {
        this.readClient.removeAllListeners();
        this.readClient.quit();
        this.readClient = null;
    }
};

internals.Connection.prototype.isReady = function() {
    return (!!this.writeClient && !!this.readClient);
};

internals.Connection.prototype.validateSegmentName = function(name) {
    if (!name) {
        return new Error('Empty string');
    }

    if (name.indexOf('\u0000') !== -1) {
        return new Error('Includes null character');
    }

    return null;
};

internals.Connection.prototype.get = function(key, callback) {
    if (!this.readClient) {
        return callback(new Error('Connection not started'));
    }

    this.readClient.get(this.generateKey(key), function(err, result) {
        if (err) {
            return callback(err);
        }

        if (!result) {
            return callback(null, null);
        }

        var envelope = null;
        try {
            envelope = JSON.parse(result);
        } catch (err) {
            /*eslint: no-empty:0 */
        } // Handled by validation below

        if (!envelope) {
            return callback(new Error('Bad envelope content'));
        }

        if (!envelope.item ||
            !envelope.stored) {

            return callback(new Error('Incorrect envelope structure'));
        }

        return callback(null, envelope);
    });
};

internals.Connection.prototype.set = function(key, value, ttl, callback) {
    var self = this;

    if (!this.writeClient) {
        return callback(new Error('Connection not started'));
    }

    var envelope = {
        item: value,
        stored: Date.now(),
        ttl: ttl
    };

    var cacheKey = this.generateKey(key);

    var stringifiedEnvelope = null;

    try {
        stringifiedEnvelope = JSON.stringify(envelope);
    } catch (err) {
        return callback(err);
    }

    this.writeClient.set(cacheKey, stringifiedEnvelope, function(err) {
        if (err) {
            return callback(err);
        }

        var ttlSec = Math.max(1, Math.floor(ttl / 1000));
        self.writeClient.expire(cacheKey, ttlSec, function(err) {
            // Use 'pexpire' with ttl in Redis 2.6.0
            return callback(err);
        });
    });
};

internals.Connection.prototype.drop = function(key, callback) {
    if (!this.writeClient) {
        return callback(new Error('Connection not started'));
    }

    this.writeClient.del(this.generateKey(key), function(err) {
        return callback(err);
    });
};

internals.Connection.prototype.generateKey = function(key) {
    return encodeURIComponent(this.settings.partition) + ':' + encodeURIComponent(key.segment) + ':' + encodeURIComponent(key.id);
};
