const config = require('../config');
const errors = require('restify-errors');

function integer(x, name, arrayElement) {
  if (typeof x === 'string' && x.match(/^-?\d+$/)) x = Number(x);
  if (typeof x !== 'number' || ~~x !== x) {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be integers: ` + JSON.stringify(x));
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must be an integer: ` + JSON.stringify(x));
  }
}

function positiveInteger(x, name) {
  if (typeof x === 'string' && x.match(/^\d+$/)) x = Number(x);
  if (typeof x !== 'number' || ~~x !== x || x < 1)
    throw new errors.InvalidArgumentError(`the parameter "${name}" must be a positive integer: ` + JSON.stringify(x));
}

function nonNegativeInteger(x, name, arrayElement) {
  if (typeof x === 'string' && x.match(/^\d+$/)) x = Number(x);
  if (typeof x !== 'number' || ~~x !== x || x < 0) {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be non-negative integers: ` + JSON.stringify(x));
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must be a non-negative integer: ` + JSON.stringify(x));
  }
}

function string(x, name, arrayElement, emptyOK) {
  if (typeof x !== 'string') {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be strings: ` + JSON.stringify(x));
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must be a string: ` + JSON.stringify(x));
  }
  else if (!x.length && !emptyOK) {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be non-empty strings`);
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must be a non-empty string`);
  }
}

function scalar(x, name, arrayElement) {
  if (typeof x === 'string' && x !== '' || typeof x === 'number' && ~~x === x && x >= 0) return;

  if (arrayElement)
    throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be non-empty strings or non-negative integers: ` + JSON.stringify(x));
  else
    throw new errors.InvalidArgumentError(`the parameter "${name}" must be a non-empty string or a non-negative integer: ` + JSON.stringify(x));
}

function bool(x, name) {
  if (typeof x === 'string') {
    if (x === 'true' || x === '1') x = true;
    else if (x === 'false' || x === '0') x = false;
  }
  else if (typeof x === 'number') {
    if (x === 1) x = true;
    else if (x === 0) x = false;
  }

  if (x !== true && x !== false)
    throw new errors.InvalidArgumentError(`the parameter "${name}" must be boolean: ` + JSON.stringify(x));

  return x;
}

function array(x, name, arrayElement, emptyOK) {
  if (x === undefined)
    throw new errors.InvalidArgumentError(`you must provide an array parameter "${name}"`);
  else if (!(x instanceof Array)) {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be arrays: ` + JSON.stringify(x));
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must be an array: ` + JSON.stringify(x));
  }
  else if (!emptyOK && x.length === 0) {
    if (arrayElement)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must contain at least one element`);
    else
      throw new errors.InvalidArgumentError(`the parameter "${name}" must contain at least one element`);
  }
  else if (!arrayElement && x.length > config.limit.arrayMax)
    throw new errors.InvalidArgumentError(`the parameter "${name}" takes a maximum of ${config.limit.arrayMax} elements`);

  return x;
}

function range(range, cols) {
  array(range, 'range');
  if (range.length !== 3) throw new errors.InvalidArgumentError('the parameter "range" must contain exactly three elements');

  range.forEach(item => {
    if (typeof item !== 'string') throw new errors.InvalidArgumentError('the parameter "range" must contain only strings: ' + JSON.stringify(item));
  });

  if (cols.indexOf(range[0]) === -1) {
    throw 'the first element of the parameter "range" was invalid: valid values are ' +
      cols.map(item => `"${item}"`).join(', ');
  }

  return [range[0], range[1].normalize('NFC'), range[2].normalize('NFC')];

  /*
  if (range[1].length < 1 || range[2].length < 1)
    throw new errors.InvalidArgumentError('the second and third elements of "range" must be at least one character long');

  if (range[1] >= range[2])
    throw new errors.InvalidArgumentError('the second element of "range" must be alphabetically earlier than the third element');

  if (range[1][0] !== range[2][0])
    throw new errors.InvalidArgumentError('the first character of the two "range" strings must match');

  if (decode(range[2][1])[0] - decode(range[1][1])[0] > 2)
    throw new errors.InvalidArgumentError('the second character of the two "range" strings cannot be more than two values apart');
  */
}

function idPairs(x, name) {
  x.forEach(item => {
    if (!(item instanceof Array))
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be arrays: ` + JSON.stringify(item));

    if (item.length != 2)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be two-element arrays: ` + JSON.stringify(item));

    item.forEach(id => {
      nonNegativeInteger(id, name, true);
    });
  });
}

function uidPairs(x, name) {
  x.forEach(item => {
    if (!(item instanceof Array))
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be arrays: ` + JSON.stringify(item));

    if (item.length != 2)
      throw new errors.InvalidArgumentError(`elements of the parameter "${name}" must be two-element arrays: ` + JSON.stringify(item));

    item.forEach(uid => {
      if (typeof(uid) !== 'string')
        throw new errors.InvalidArgumentError(`invalid non-string "${name}" item: ` + JSON.stringify(uid));
      else if (!uid.match(/^[a-z]{3}-\d{3}$/))
        throw new errors.InvalidArgumentError(`badly formatted "${name}" item: ${uid}`);
    });
  });
}

module.exports = {
  integer: integer,
  positiveInteger: positiveInteger,
  nonNegativeInteger: nonNegativeInteger,
  string: string,
  scalar: scalar,
  bool: bool,
  array: array,
  range: range,
  idPairs: idPairs,
  uidPairs: uidPairs,
};
