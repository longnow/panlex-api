const config = require('../../config');

const request = require('request');
const errors = require('restify-errors');

function init(app) {
  app.get('/v2/graph/:expr1/:expr2', graph);
}

function graph(req, res, next) {
  const expr1 = req.params.expr1;
  const expr2 = req.params.expr2;

  if (!expr1.match(/^\d+$/) || !expr2.match(/^\d+$/))
    throw new errors.InvalidArgumentError('you must pass two numeric expression ids');

  request.get(config.graph + '/' + expr1 + '/' + expr2, (err, resGraph, body) => {
    if (err) return next(new errors.InternalError('error contacting graph server'));
    res.json(body);
    next();
  });
}

module.exports = {
  init: init
};
