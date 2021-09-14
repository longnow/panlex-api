const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('norm', function () {
  it('expr exact', function (done) {
    query('/v2/norm/expr/187', { txt: ['hello', 'blah'] }, done,
    function (data) {
      should.exist(data.norm);
      should.exist(data.norm['hello']);
      should.exist(data.norm['hello'].score);
      done();
    });
  });

  it('expr degrade', function (done) {
    query('/v2/norm/expr/187', { txt: ['hello!', 'blah!'], degrade: true }, done,
    function (data) {
      should.exist(data.norm);
      should.exist(data.norm['hello!']);
      should.exist(data.norm['hello!'][0].score);
      should.exist(data.norm['hello!'][0].txt);
      done();
    });
  });

  it('expr degrade custom', function (done) {
    query('/v2/norm/expr/ind-000', { txt: ['barang'], degrade: true, regex: ['[bp]', 'p'] }, done,
    function (data) {
      should.exist(data.norm);
      should.exist(data.norm['barang']);
      should.exist(data.norm['barang'][0].score);
      should.exist(data.norm['barang'][0].txt);
      done();
    });
  });

  it('definition exact', function (done) {
    query('/v2/norm/definition/187', { txt: ['hello', 'blah'] }, done,
    function (data) {
      should.exist(data.norm);
      should.exist(data.norm['hello']);
      should.exist(data.norm['hello'].score);
      done();
    });
  });

  it('definition degrade', function (done) {
    query('/v2/norm/definition/187', { txt: ['hello!', 'blah!'], degrade: true }, done,
    function (data) {
      should.exist(data.norm);
      should.exist(data.norm['hello!']);
      should.exist(data.norm['hello!'][0].score);
      should.exist(data.norm['hello!'][0].txt);
      done();
    });
  });
});
