const config = require('../config');
const canonicalJson = require('canonical-json/index2');
const crypto = require('crypto');
const _ = require('lodash');
const redis = require('./redis');

const expireSeconds = config.cacheExpireSeconds || 60 * 60 * 24;

function get(req, cb) {
  redis.get(hashRequest(req), wrapError(cb));
};

function set(req, value, cb) {
  const key = hashRequest(req);
  redis
    .multi()
    .set(key, value)
    .expire(key, expireSeconds)
    .exec(wrapError(cb));
};

function hashRequest(req) {
  const key = [
    req.url,
    req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    canonicalJson(req.get('cachedQuery'))
  ].join('||');

  const hash = crypto.createHash('sha1');
  hash.update(key, 'utf8');
  return 'panlex:' + hash.digest('base64');
}

function wrapError(cb) {
  return function(err, reply) {
    if (cb) {
      if (err) cb(err);
      else if (reply && reply.errors) {
        const errstr = _.uniq(errors.map(item => item.code )).join('; ');
        cb(errstr);
      }
      else {
        cb(null, reply);
      }
    }
  }
}

module.exports = {
  get: get,
  set: set,
};
