const config = require('../../config');

const request = require('request');
const errors = require('restify-errors');
const validate = require('../../lib/validate');

const DEFAULT_COUNT = 20;

function init(app) {
  app.apiRoute({ path: '/v2/fake_expr', cache: false }, fakeExpr);
}

function fakeExpr(req, res, next) {
  if (!('uid' in req.query)) return next(new errors.MissingParameterError('the parameter "uid" is required'));
  else {
    validate.string(req.query.uid, 'uid');
    if (!req.query.uid.match(/^[a-z]{3}-\d{3}$/)) return next(new errors.InvalidArgumentError(`invalid uid format: "${req.query.uid}"`));
  }

  if ('count' in req.query) validate.positiveInteger(req.query.count, 'count');
  if ('state_size' in req.query) validate.positiveInteger(req.query.state_size, 'state_size');

  req.query.count = Math.min(req.query.count || DEFAULT_COUNT, config.limit.responseMax);

  const knownQuery = req.get('knownQuery');
  for (const k in req.query) knownQuery[k] = true;

  request.get({
    url: config.fakeExpr,
    qs: req.query,
  }, (err, resFakeExpr, body) => {
    if (err) {
      console.error(err);
      return next(new errors.InternalError('error contacting fake_expr service'));
    }

    if (resFakeExpr.statusCode !== 200) {
      res.status(resFakeExpr.statusCode);
      res.json(body);
    }
    else {
      const obj = req.get('obj');
      obj.result = JSON.parse(body);
      obj.resultMax = config.limit.responseMax;
      obj.resultNum = obj.result.length;
      obj.resultType = 'fake_expr';
    }

    next();
  });
}

module.exports = {
  init: init
};
