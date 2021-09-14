const errors = require('restify-errors');

module.exports = function makeRestError(err) {
  if (!(err instanceof errors.HttpError))
    err = new errors.InternalError(err.message || err);

  return err;
};
