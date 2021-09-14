const array = require('../../lib/array');
const config = require('../../config');
const knex = require('../../lib/db');
const validate = require('../../lib/validate');
const urlPrefix = 'http://localhost:' + config.port + '/v2';

const request = require('request');
const errors = require('restify-errors');

function init(app) {
  app.apiRoute('/v2/fallback', fallback);
}

function fallback(req, res, next) {
  validate.array(req.query.requests);
  const requests = req.query.requests;
  if (requests.length > 10) return next(new errors.InvalidArgumentError('the parameter "requests" cannot contain more than 10 elements'));
  req.get('knownQuery').requests = true;
  const max = requests.length - 1;

  query(0);

  function query(i) {
    const q = requests[i];

    if (!('url' in q || 'query' in q)) return next(new errors.InvalidArgumentError('each request in "requests" must have a "url" and "query" value'));
    if (typeof q.url !== 'string') return next(new errors.InvalidArgumentError('the "url" value of a request object must be a string'));
    if (typeof q.query !== 'object') return next(new errors.InvalidArgumentError('the "query" value of a request object must be an object'));

    request({
      url: urlPrefix + q.url.replace(/^\/v2/, ''),
      method:         'POST',
      body:           q.query,
      json:           true,
      followRedirect: false,
      timeout:        60000
    }, (err, subRes, subObj) => {
      res.statusCode = subRes.statusCode;

      if (err || subRes.statusCode !== 200 || (subObj.result && subObj.result.length) || i === max) {
        const obj = req.get('obj');

        for (const k in subObj) {
          obj[k] = subObj[k];
        }

        obj.requestNum = i;

        next();
      }
      else query(i+1);
    });

  }
}

module.exports = {
  init: init,
};
