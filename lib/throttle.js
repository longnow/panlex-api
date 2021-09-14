const errors = require('restify-errors');
const { BurstyRateLimiter, RateLimiterRedis, RateLimiterRes } = require('rate-limiter-flexible');
const redis = require('./redis');

const config = require('../config').throttle;
let rateLimiter;

if (config) {
  rateLimiter = new BurstyRateLimiter(
    new RateLimiterRedis({
      points: config.ratePerMinute,
      duration: 60,
      storeClient: redis,
    }),
    new RateLimiterRedis({
      points: config.ratePerMinute * 2,
      duration: 90,
      storeClient: redis,
      keyPrefix: 'burst',
    })
  );
}

module.exports = (req, res, next) => {
  const id = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  rateLimiter.consume(id)
  .then(rateLimiterRes => {
    next();
  })
  .catch(rejRes => {
    if (rejRes instanceof RateLimiterRes) {
      res.setHeader('Retry-After', rejRes.msBeforeNext / 1000);
      res.setHeader('X-RateLimit-Limit', config.ratePerMinute);
      res.setHeader('X-RateLimit-Remaining', rejRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rejRes.msBeforeNext));
      next(new errors.TooManyRequestsError('Rate limit of of ' + config.ratePerMinute + ' requests/minute exceeded'));
    }
    else {
      next(new errors.InternalError('unknown error'));
      console.error('redis error in throttle.js');
      console.error(rejRes);
    }
  });
};
