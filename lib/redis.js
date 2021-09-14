const config = require('../config');
const redis = require('redis');

let client;

if (config.cache || config.throttle) {
  client = redis.createClient({ db: config.redisdb || 0 });
  client.flushdb(() => {});
}

module.exports = client;
