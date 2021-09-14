const query = require('../query');
const should = require('should');

describe('denotation', function () {
  it('get matching', function (done) {
    query('/v2/denotation', { expr: [441285, 600704], include: 'denotation_class' }, done,
    function (data) {
      should.exist(data.result);
      (data.result.some(function (i) { return i.denotation_class.length && i.denotation_class[0][1] === 22080029 })).should.be.true;
      done();
    });
  });

  it('all params', function (done) {
    query('/v2/denotation', {
        denotation_class: [[5, 5], [null, 5], [5, null]],
        denotation_prop: [[5, 'bar'], [5, null]],
        expr: 2,
        id: [1,2,3],
        include: ['denotation_class','denotation_prop'],
        langvar: 666,
        meaning: 3,
        source: 2,
        uid: ['spa-000','eng-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/denotation/100297066', {
        include: ['denotation_class','denotation_prop'],
    },
    done,
    function (data) {
      should.exist(data.denotation);
      done();
    });
  });
});
