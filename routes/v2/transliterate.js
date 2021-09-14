const RBT = require('icu-transliterator').RBT;

const errors = require('restify-errors');
const validate =require('../../lib/validate');

const ARRAY_PARAMS = ['txt'];

function init(app) {
  app.apiRoute({ path: '/v2/transliterate', arrayParams: ARRAY_PARAMS }, transliterate);
}

function transliterate(req, res, next) {
  const knownQuery = req.get('knownQuery');

  let type;
  if ('id' in req.query && 'rules' in req.query) throw new errors.InvalidArgumentError('you can only pass one of the parameters "id" and "rules"');
  else if ('id' in req.query) {
    knownQuery.id = true;
    validate.string('id', req.query.id);
    type = 'id';
  }
  else if ('rules' in req.query) {
    knownQuery.rules = true;
    validate.string('rules', req.query.rules);
    type = 'rules';
  }
  else return next(new errors.MissingParameterError('you must pass one of the parameters "id" or "rules"'));

  if (!('txt' in req.query)) return next(new errors.MissingParameterError('the parameter "txt" is required'));
  knownQuery.txt = true;
  validate.array(req.query.txt, 'txt');

  let direction;
  if ('direction' in req.query) {
    knownQuery.direction = true;
    validate.string(req.query.direction, 'direction');
    if (req.query.direction !== 'forward' && req.query.direction !== 'reverse') throw new errors.InvalidArgumentError('the parameter "direction" must be "forward" or "reverse"');
    direction = req.query.direction === 'forward' ? RBT.FORWARD : RBT.REVERSE;
  }
  else direction = RBT.FORWARD;

  const obj = req.get('obj');
  obj.resultType = 'transliterate';

  try {
    const rbt = type === 'id' ? RBT(req.query.id, direction) : RBT.fromRules(req.query.rules, direction);

    obj.txt = [];
    req.query.txt.forEach(item => {
      validate.string(item, 'txt', true);
      obj.txt.push(rbt.transliterate(item));
    });
  } catch (e) {
    return next(new errors.InvalidArgumentError(e.message));
  }

  next();
}

module.exports = {
  init: init,
};
