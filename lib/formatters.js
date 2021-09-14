const config = require('../config');
const cache = require('./cache');
const logger = require('./logger');
const makeRestError = require('./make_rest_error');

const errors = require('restify-errors');

function json(req, res, body) {
  // do nothing if body is already a string (e.g. retrived from cache)
  if (typeof body === 'string') {
    res.setHeader('Content-Length', Buffer.byteLength(body));
    return body;
  }

  // if this is an error, return its body property
  if (body instanceof errors.HttpError) return error();

  return format(body);

  function format(body) {
    // encode JSON, respecting the "indent" parameter and adding trailing newline
    const data = JSON.stringify(body, null, req.get('jsonIndent')) + '\n';

    if (config.cache && res.statusCode === 200 && req.get('cachedQuery'))
      cache.set(req, data);

    logRequest(req, res);

    res.setHeader('Content-Length', Buffer.byteLength(data));
    return data;
  }

  function error(err) {
    return format(processError(res, body, err));
  }
}

function logRequest(req, res) {
  if (logger.log && res.statusCode === 200) {
    const elapsedMs = Date.now() - req.time();
    logger.log.info({ req: req, res: res, elapsedMs: elapsedMs });
  }
}

function processError(res, body, err) {
  if (err) res.statusCode = err.statusCode;
  else err = body;

  if (err instanceof errors.InternalError) {
    console.error(err);
    err.body.message = 'unknown error';
  }

  return err.body;
}

module.exports = {
  json: json,
};
