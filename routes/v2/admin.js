const redis = require('../../lib/redis');
const errors = require('restify-errors');

function init(app) {
  if (redis) app.get('/v2/admin/flushcache', flushRedis);
}

function flushRedis(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ip === '127.0.0.1') {
    redis.flushdb(() => {
      res.send(200);
      next();
    });
  }
  else next(new errors.NotAuthorizedError());
}

module.exports = {
  init: init
};
